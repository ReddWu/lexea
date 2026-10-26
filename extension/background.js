// background.js — local-first store. Words live in chrome.storage.local
// (one key per word: "w:<lemma>" for English, "w:<lang>:<lemma>" otherwise).
// Each capture is ALSO mirrored through the Echowords backend (Next.js → Supabase)
// when the user is signed in — best-effort, non-blocking, no secret keys in the
// extension. Override the backend base URL via chrome.storage `miaBase`.

const KEY = (lemma, lang) => (!lang || lang === "en" ? "w:" + lemma : `w:${lang}:${lemma}`);
const nowISO = () => new Date().toISOString();
const DEFAULT_MIA_BASE = "https://mia-tutor.vercel.app"; // set chrome.storage `miaBase` to http://localhost:3002 for local dev
const SUPABASE_URL = "https://mpuzorimmmcgpjgbekkx.supabase.co"; // auth only; data flows through the Echowords backend
const SUPABASE_KEY = "sb_publishable_A8tPtsGkIf0Tv73asZiNoA_YmvrkTbs"; // publishable — safe to ship, RLS guards the data

async function miaBase() {
  const { miaBase } = await chrome.storage.local.get("miaBase");
  return (miaBase || DEFAULT_MIA_BASE).replace(/\/+$/, "");
}

// --- auth: Google sign-in via Supabase (PKCE) ------------------------------
// Session { accessToken, refreshToken, email, name } lives in storage.
// authFetch() attaches the token and transparently refreshes once on 401.

async function getSession() {
  const { miaSession } = await chrome.storage.local.get("miaSession");
  if (!miaSession) return null;
  // a session minted by another auth backend (e.g. InsForge before the
  // 2026-10 move) can never refresh here — drop it so the UI asks for a fresh sign-in
  if (miaSession.host !== SUPABASE_URL) {
    await chrome.storage.local.remove("miaSession");
    return null;
  }
  return miaSession;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// POST /auth/v1/token — shared by the PKCE exchange and refresh grants.
async function tokenRequest(grant, body) {
  return fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(body),
  });
}

async function signIn() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(raw);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64url(digest);
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256&prompt=select_account`;
  const finalUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(finalUrl).searchParams.get("code");
  if (!code) throw new Error("sign-in cancelled");

  const ex = await tokenRequest("pkce", { auth_code: code, code_verifier: verifier });
  if (!ex.ok) throw new Error(`exchange ${ex.status}`);
  const data = await ex.json();
  if (!data.access_token) throw new Error("no access token");
  const meta = data.user?.user_metadata || {};
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    email: data.user?.email || null,
    name: meta.full_name || meta.name || data.user?.email || null,
    host: SUPABASE_URL,
  };
  await chrome.storage.local.set({ miaSession: session });
  return session;
}

async function signOut() {
  await chrome.storage.local.remove("miaSession");
}

let refreshing = null; // dedupe concurrent refreshes
async function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = await getSession();
    if (!s?.refreshToken) return false;
    try {
      const res = await tokenRequest("refresh_token", { refresh_token: s.refreshToken });
      if (!res.ok) {
        await signOut(); // refresh token expired/revoked — require a new sign-in
        return false;
      }
      const data = await res.json();
      await chrome.storage.local.set({
        miaSession: {
          ...s,
          accessToken: data.access_token || s.accessToken,
          refreshToken: data.refresh_token || s.refreshToken,
        },
      });
      return true;
    } catch (_e) {
      return false; // network blip — keep the session, retry later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// fetch with Bearer token; retries once through a refresh on 401.
// Returns null when signed out (callers treat cloud sync as optional).
async function authFetch(url, opts = {}) {
  let s = await getSession();
  if (!s) return null;
  const withTok = (tok) => ({
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${tok}` },
  });
  let res = await fetch(url, withTok(s.accessToken));
  if (res.status === 401) {
    if (!(await refreshSession())) return res;
    s = await getSession();
    if (!s) return res;
    res = await fetch(url, withTok(s.accessToken));
  }
  return res;
}

// --- language handling ------------------------------------------------------
const LANGS = ["en", "zh", "es", "fr", "ja"];

function cleanSurface(word) {
  return String(word || "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function canonicalLemma(word, lang = "en") {
  let lemma = cleanSurface(word).toLocaleLowerCase(lang === "es" ? "es" : undefined);
  if (lang === "es") {
    // Keep punctuation in `word` for display, but do not create separate cards
    // for ¿Qué tal?, "qué tal", and qué tal.
    lemma = lemma
      .replace(/^[¿¡"'“”«»()[\]{}.,;:!?…\-–—\s]+/u, "")
      .replace(/[¿¡"'“”«»()[\]{}.,;:!?…\-–—\s]+$/u, "")
      .replace(/\s+/g, " ");
  }
  return lemma;
}

// --- inflection-aware dedup (English only) ----------------------------------
// "running", "runs", "ran" and "run" are one word. Conservative on purpose:
// plural/3rd-person -s, -ing, -ed and common irregulars only. We deliberately
// do NOT strip -er/-est/-ly (teacher ≠ teach, writer ≠ write).
const IRREGULAR = {
  went:"go", gone:"go", ran:"run", ate:"eat", eaten:"eat", was:"be", were:"be", been:"be",
  children:"child", mice:"mouse", feet:"foot", teeth:"tooth", men:"man", women:"woman",
  people:"person", geese:"goose", took:"take", taken:"take", made:"make", said:"say",
  saw:"see", seen:"see", came:"come", knew:"know", known:"know", thought:"think",
  bought:"buy", brought:"bring", felt:"feel", kept:"keep", left:"leave", lost:"lose",
  met:"meet", paid:"pay", sold:"sell", told:"tell", understood:"understand", wrote:"write",
  written:"write", spoke:"speak", spoken:"speak", broke:"break", broken:"break",
  chose:"choose", chosen:"choose", drove:"drive", driven:"drive", fell:"fall", fallen:"fall",
  flew:"fly", flown:"fly", forgot:"forget", forgotten:"forget", gave:"give", given:"give",
  grew:"grow", grown:"grow", held:"hold", led:"lead", rose:"rise", risen:"rise",
  sang:"sing", sung:"sing", sat:"sit", slept:"sleep", stood:"stand", swam:"swim",
  threw:"throw", thrown:"throw", woke:"wake", woken:"wake", wore:"wear", worn:"wear", won:"win",
};
const CONS = "bcdfghjklmnpqrstvwxz";

function baseCandidates(w) {
  const out = new Set();
  if (IRREGULAR[w]) out.add(IRREGULAR[w]);
  // plural / 3rd person
  if (w.endsWith("ies") && w.length > 4) out.add(w.slice(0, -3) + "y");
  if (/(ches|shes|xes|zes|sses|oes)$/.test(w)) out.add(w.slice(0, -2));
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length > 3) out.add(w.slice(0, -1));
  // -ing / -ed with un-doubling and e-restoration
  for (const [suf, min] of [["ing", 5], ["ed", 4]]) {
    if (w.endsWith(suf) && w.length >= min) {
      const s = w.slice(0, -suf.length);
      out.add(s); // walk(ing) → walk
      out.add(s + "e"); // mak(ing) → make
      if (s.length > 2 && s.at(-1) === s.at(-2) && CONS.includes(s.at(-1))) out.add(s.slice(0, -1)); // runn → run
    }
  }
  if (w.endsWith("ied") && w.length > 4) out.add(w.slice(0, -3) + "y"); // studied → study
  out.delete(w);
  return [...out];
}

// Resolve which storage key an incoming word belongs to. English gets the
// inflection dance; other languages match the exact (lowercased) form.
async function resolveLemma(word, lang = "en") {
  const lemma = canonicalLemma(word, lang);
  if (lang === "es") {
    const all = await chrome.storage.local.get(null);
    for (const [key, rec] of Object.entries(all)) {
      if (!key.startsWith("w:es:")) continue;
      const existing = rec?.lemma || key.slice(5);
      if (canonicalLemma(existing, "es") === lemma) return existing;
    }
    return lemma;
  }
  if (lang !== "en") return lemma;
  const all = await chrome.storage.local.get(null);
  const have = new Set(
    Object.keys(all)
      .filter((k) => k.startsWith("w:") && !/^w:(zh|es|fr|ja):/.test(k))
      .map((k) => k.slice(2))
  );
  if (have.has(lemma)) return lemma;
  for (const c of baseCandidates(lemma)) if (have.has(c)) return c;
  for (const l of have) if (baseCandidates(l).includes(lemma)) return l;
  return lemma;
}

function newRecord(p, lemma) {
  const t = nowISO();
  const sentence = p.context && p.context.trim() ? p.context.trim() : null;
  return {
    word: cleanSurface(p.word),
    lemma,
    lang: LANGS.includes(p.lang) ? p.lang : "en",
    translation: null,
    context: sentence,
    contexts: sentence ? [{ sentence, url: p.url || null, title: p.title || null, at: t }] : [],
    source_url: p.url || null,
    source_title: p.title || null,
    // spaced-repetition state (SM-2) — a fresh, due-now card
    state: "new",
    due: t,
    ease: 2.5,
    interval_days: 0,
    stability: null, // reserved for future FSRS
    difficulty: null, // reserved for future FSRS
    reps: 0,
    lapses: 0,
    last_review: null,
    // openclaw signal
    times_used_in_chat: 0,
    status: "active",
    created_at: t,
    updated_at: t,
  };
}

async function saveLocal(p) {
  const word = cleanSurface(p.word);
  if (!word) throw new Error("empty word");
  const lang = LANGS.includes(p.lang) ? p.lang : "en";
  const lemma = await resolveLemma(word, lang); // inflection-aware / phrase-aware
  if (!lemma) throw new Error("empty word");
  const k = KEY(lemma, lang);
  const cur = (await chrome.storage.local.get(k))[k];
  let rec;
  if (cur) {
    rec = cur;
    const sentence = p.context && p.context.trim() ? p.context.trim() : null;
    if (sentence) {
      if (!rec.contexts.some((c) => c.sentence === sentence)) {
        rec.contexts.push({ sentence, url: p.url || null, title: p.title || null, at: nowISO() });
      }
      rec.context = sentence;
    }
    // keep the originally-saved surface form; a variant only adds context
    if (p.url) rec.source_url = p.url;
    if (p.title) rec.source_title = p.title;
    if (rec.status !== "archived") rec.status = "active"; // re-seeing a "known" word reactivates it
    rec.updated_at = nowISO();
  } else {
    rec = newRecord({ ...p, word }, lemma);
  }
  await chrome.storage.local.set({ [k]: rec });
  return rec;
}

// Mirror the locally-merged record through the Echowords backend (upsert on lemma).
// We never send `id` (DB-generated) or `times_used_in_chat` (owned by the agent).
function cloudBody(rec) {
  const { id, times_used_in_chat, ...rest } = rec;
  return rest;
}

// Best-effort (local is the source of truth): never throws, but reports the
// outcome so the manual "Upload all" button can tell real successes apart.
async function pushCloud(rec) {
  try {
    const base = await miaBase();
    const res = await authFetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudBody(rec)),
    });
    if (!res) return { ok: false, error: "not signed in" };
    if (!res.ok) return { ok: false, error: `sync ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function deleteCloud(lemma, lang) {
  try {
    const base = await miaBase();
    await authFetch(`${base}/api/words`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lemma, lang: lang || "en" }),
    });
  } catch (_e) {
    // best-effort
  }
}

// --- word info for the "Save to Echowords" card -------------------------------
// English merges three sources: bundled IPA + ECDICT (instant, offline),
// Datamuse (fallback), and the Echowords backend /api/define (LLM).
// Other languages go straight to /api/define, which returns a reading
// (pinyin / kana / IPA) alongside the explanation.
let ipaMapPromise = null;
function ipaMap() {
  if (!ipaMapPromise) {
    ipaMapPromise = fetch(chrome.runtime.getURL("ipa-en.json"))
      .then((r) => r.json())
      .catch(() => {
        ipaMapPromise = null; // retry next call instead of caching failure
        return {};
      });
  }
  return ipaMapPromise;
}

// ECDICT (skywind3000/ECDICT, 57k common words): instant 中文 gloss + phonetic
let ecdictPromise = null;
function ecdict() {
  if (!ecdictPromise) {
    ecdictPromise = fetch(chrome.runtime.getURL("ecdict-zh.json"))
      .then((r) => r.json())
      .catch(() => {
        ecdictPromise = null; // retry next call instead of caching failure
        return {};
      });
  }
  return ecdictPromise;
}

async function localPhonetic(word) {
  const map = await ipaMap();
  const w = (word || "").trim().toLowerCase();
  for (const cand of [w, ...baseCandidates(w)]) {
    if (map[cand]) return map[cand];
  }
  return null;
}

// Everything we know about a word without touching the network (English only).
async function localQuick(word, lang = "en") {
  if (lang !== "en") return { phonetic: null, zh: null };
  const [ipa, zhMap] = await Promise.all([localPhonetic(word), ecdict()]);
  const w = (word || "").trim().toLowerCase();
  let entry = null;
  for (const cand of [w, ...baseCandidates(w)]) {
    if (zhMap[cand]) {
      entry = zhMap[cand];
      break;
    }
  }
  return {
    phonetic: ipa || (entry && entry[1] ? `/${entry[1]}/` : null),
    zh: entry ? entry[0] : null,
  };
}

// Datamuse (WordNet/Wiktionary-backed, no key, ~0.1s). Replaced
// dictionaryapi.dev in 2026-10 after it started hanging ~20s and returning 522.
async function fetchDictOnce(word) {
  const res = await fetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=dr&ipa=1&max=1`,
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry || String(entry.word).toLowerCase() !== word.toLowerCase()) return null; // sp= can fuzzy-match
  const ipa = (entry.tags || []).find((t) => t.startsWith("ipa_pron:"));
  const phonetic = ipa ? `/${ipa.slice(9)}/` : null;
  const first = (entry.defs || [])[0];
  let dictDef = null;
  if (first) {
    const [pos, text] = first.split("\t");
    dictDef = text ? `(${pos}) ${text.trim()}` : first.trim();
  }
  return { phonetic, dictDef };
}
async function fetchDict(word) {
  try {
    const w = word.toLowerCase();
    // inflected forms often miss (subpoenas → subpoena): fall back to base candidates
    for (const cand of [w, ...baseCandidates(w)].slice(0, 2)) {
      const hit = await fetchDictOnce(cand);
      if (hit && (hit.phonetic || hit.dictDef)) return hit;
    }
    return {};
  } catch (_e) {
    return {};
  }
}

async function fetchDefine(word, context, lang = "en") {
  const url = `${await miaBase()}/api/define`;
  try {
    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, context, lang }),
    });
    if (!res || !res.ok) return { needsAuth: res?.status === 401 || !res };
    const data = await res.json();
    return { plain: data.plain || null, zh: data.zh || null, reading: data.reading || null };
  } catch (_e) {
    return {}; // backend not running — dictionary fallback still works
  }
}

async function defineWord(p) {
  const lang = LANGS.includes(p.lang) ? p.lang : "en";
  // LLM contextual explanation; local layers already gave phonetic + 中文 (en)
  const [quick, ai] = await Promise.all([
    localQuick(p.word, lang),
    fetchDefine(p.word, p.context, lang),
  ]);
  const info = {
    phonetic: quick.phonetic || ai.reading || null,
    plain: ai.plain || null,
    zh: ai.zh || quick.zh || null,
    needsAuth: ai.needsAuth || false,
  };
  // write back onto the saved record (best-effort; variant-aware)
  const lemma = await resolveLemma(p.word, lang);
  const k = KEY(lemma, lang);
  const cur = (await chrome.storage.local.get(k))[k];
  if (cur) {
    if (info.zh && !cur.translation) cur.translation = info.zh;
    if (info.plain && !cur.definition) cur.definition = info.plain;
    if (info.phonetic) cur.phonetic = info.phonetic;
    cur.updated_at = nowISO();
    await chrome.storage.local.set({ [k]: cur });
    pushCloud(cur); // fire-and-forget
  }
  return info;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // --- auth (popup/options UI) ---
  if (msg?.type === "authStatus") {
    getSession()
      .then((s) => sendResponse({ ok: true, signedIn: !!s, email: s?.email || null, name: s?.name || null }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "signIn") {
    // merge with the cloud library right away: pull so a fresh install isn't
    // empty, push what was saved while signed out
    signIn()
      .then(async (s) => {
        const pulled = await pullCloudWords().catch(() => null);
        if (pulled?.ok) await pushLocalOnly(pulled.cloudKeys).catch(() => {});
        sendResponse({ ok: true, email: s.email, name: s.name });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === "signOut") {
    signOut()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  // instant local phonetic + 中文 for the capture card (no network),
  // persisted onto the stored record so review/dashboard get it too
  if (msg?.type === "phonetic" && msg.payload?.word) {
    (async () => {
      const lang = LANGS.includes(msg.payload.lang) ? msg.payload.lang : "en";
      const info = await localQuick(msg.payload.word, lang);
      try {
        const lemma = await resolveLemma(msg.payload.word, lang);
        const k = KEY(lemma, lang);
        const cur = (await chrome.storage.local.get(k))[k];
        if (cur) {
          let dirty = false;
          if (info.zh && !cur.translation) (cur.translation = info.zh), (dirty = true);
          if (info.phonetic && !cur.phonetic) (cur.phonetic = info.phonetic), (dirty = true);
          if (dirty) {
            cur.updated_at = nowISO();
            await chrome.storage.local.set({ [k]: cur });
            pushCloud(cur);
          }
        }
      } catch (_e) {}
      sendResponse({ ok: true, ...info });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  }
  // network dictionary definition (~1-2s) — interim English def before the LLM
  if (msg?.type === "dictdef" && msg.payload?.word) {
    if (msg.payload.lang && msg.payload.lang !== "en") {
      sendResponse({ ok: true }); // the online dictionary is English-only
      return false;
    }
    fetchDict(msg.payload.word)
      .then((d) => sendResponse({ ok: true, ...d }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "define" && msg.payload?.word) {
    defineWord(msg.payload)
      .then((info) => sendResponse({ ok: true, ...info }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true; // async response
  }
  if (msg?.type === "capture") {
    saveLocal(msg.payload)
      .then((rec) => {
        pushCloud(rec); // fire-and-forget
        sendResponse({ ok: true });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true; // async response
  }
  // review page asks us to mirror a graded card to the cloud
  if (msg?.type === "syncWord" && msg.record) {
    pushCloud(msg.record)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // popup asks us to delete a word's cloud row
  if (msg?.type === "deleteWord" && msg.lemma) {
    deleteCloud(msg.lemma, msg.lang)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // options page: authenticated connection test
  if (msg?.type === "testCloud") {
    (async () => {
      const base = await miaBase();
      const res = await authFetch(`${base}/api/words`);
      if (!res) return sendResponse({ ok: false, error: "not signed in" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
      sendResponse({ ok: true, count: (data.words || []).length });
    })().catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // options page: pull cloud words that don't exist locally (never overwrites)
  if (msg?.type === "pullWords") {
    pullCloudWords()
      .then(({ cloudKeys, ...r }) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

// Copy cloud words that don't exist locally into storage (never overwrites).
async function pullCloudWords() {
  const base = await miaBase();
  const res = await authFetch(`${base}/api/words`);
  if (!res) return { ok: false, error: "not signed in" };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
  const local = await chrome.storage.local.get(null);
  const fresh = {};
  for (const w of data.words || []) {
    const k = KEY(w.lemma, w.lang || "en");
    if (!local[k]) {
      const { id, user_id, ...rec } = w;
      fresh[k] = rec;
    }
  }
  await chrome.storage.local.set(fresh);
  return { ok: true, added: Object.keys(fresh).length, cloudKeys: new Set((data.words || []).map((w) => KEY(w.lemma, w.lang || "en"))) };
}

// Upload words saved while signed out (local-only) once the user signs in.
// Only run at sign-in: doing it on every sync would resurrect words the user
// deleted on the web or iOS.
async function pushLocalOnly(cloudKeys) {
  const local = await chrome.storage.local.get(null);
  let pushed = 0;
  for (const [k, rec] of Object.entries(local)) {
    if (!k.startsWith("w:") || cloudKeys.has(k)) continue;
    if ((await pushCloud(rec)).ok) pushed++;
  }
  return pushed;
}
