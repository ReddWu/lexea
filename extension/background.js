// background.js — local-first store. Words live in chrome.storage.local
// (one key per word: "w:<lemma>"). Each capture is ALSO mirrored through the
// Mia backend (Next.js → Butterbase) — best-effort, non-blocking, no keys in
// the extension. Override the backend base URL via chrome.storage `miaBase`.

const KEY = (lemma) => "w:" + lemma;
const nowISO = () => new Date().toISOString();
const DEFAULT_MIA_BASE = "https://mia.butterbase.dev"; // set chrome.storage `miaBase` to http://localhost:3002 for local dev

async function miaBase() {
  const { miaBase } = await chrome.storage.local.get("miaBase");
  return (miaBase || DEFAULT_MIA_BASE).replace(/\/+$/, "");
}

// --- inflection-aware dedup -----------------------------------------------
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

// Resolve which storage key an incoming word belongs to: exact lemma first,
// then "incoming is a variant of a stored base", then the reverse.
async function resolveLemma(word) {
  const lemma = (word || "").trim().toLowerCase();
  const all = await chrome.storage.local.get(null);
  const have = new Set(Object.keys(all).filter((k) => k.startsWith("w:")).map((k) => k.slice(2)));
  if (have.has(lemma)) return lemma;
  for (const c of baseCandidates(lemma)) if (have.has(c)) return c;
  for (const l of have) if (baseCandidates(l).includes(lemma)) return l;
  return lemma;
}

function newRecord(p) {
  const t = nowISO();
  const sentence = p.context && p.context.trim() ? p.context.trim() : null;
  return {
    word: p.word.trim(),
    lemma: p.word.trim().toLowerCase(),
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
  if (!(p.word || "").trim()) throw new Error("empty word");
  const lemma = await resolveLemma(p.word); // inflection-aware: may land on an existing record
  const k = KEY(lemma);
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
    rec = newRecord(p);
  }
  await chrome.storage.local.set({ [k]: rec });
  return rec;
}

// Mirror the locally-merged record through the Mia backend (upsert on lemma).
// We never send `id` (DB-generated) or `times_used_in_chat` (owned by the agent).
function cloudBody(rec) {
  const { id, times_used_in_chat, ...rest } = rec;
  return rest;
}

async function pushCloud(rec) {
  try {
    const base = await miaBase();
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudBody(rec)),
    });
  } catch (_e) {
    // best-effort; local is the source of truth
  }
}

async function deleteCloud(lemma) {
  try {
    const base = await miaBase();
    await fetch(`${base}/api/words`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lemma }),
    });
  } catch (_e) {
    // best-effort
  }
}

// --- word info for the "Save to Mia" card -------------------------------
// Merges two sources (both CORS-open, called from the service worker):
//   1. dictionaryapi.dev  → phonetic (IPA) + fallback English definition
//   2. the Mia backend /api/define (Claude) → plain-English explanation + 中文
// Results are written back onto the stored record (best-effort).
// --- bundled IPA dictionary (open-dict-data/ipa-dict, 126k words) ----------
// Local-first phonetics: instant lookup, no network. dictionaryapi.dev stays
// as async fallback for the words the bundle misses (slang, brand-new coinage).
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

// Everything we know about a word without touching the network.
async function localQuick(word) {
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

async function fetchDictOnce(word) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) return null;
  const phonetic =
    entry.phonetic || (entry.phonetics || []).find((p) => p.text)?.text || null;
  const def =
    (entry.meanings || [])
      .flatMap((m) => m.definitions || [])
      .map((d) => d.definition)
      .find(Boolean) || null;
  return { phonetic, dictDef: def };
}

async function fetchDict(word) {
  try {
    const w = word.toLowerCase();
    // inflected forms often miss (subpoenas → subpoena): fall back to base candidates
    for (const cand of [w, ...baseCandidates(w)]) {
      const hit = await fetchDictOnce(cand);
      if (hit && (hit.phonetic || hit.dictDef)) return hit;
    }
    return {};
  } catch (_e) {
    return {};
  }
}

async function fetchDefine(word, context) {
  const url = `${await miaBase()}/api/define`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, context }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return { plain: data.plain || null, zh: data.zh || null };
  } catch (_e) {
    return {}; // backend not running — dictionary fallback still works
  }
}

async function defineWord(p) {
  // LLM contextual explanation; local layers already gave phonetic + 中文
  const [quick, ai] = await Promise.all([localQuick(p.word), fetchDefine(p.word, p.context)]);
  const info = {
    phonetic: quick.phonetic || null,
    plain: ai.plain || null,
    zh: ai.zh || quick.zh || null,
  };
  // write back onto the saved record (best-effort; variant-aware)
  const lemma = await resolveLemma(p.word);
  const k = KEY(lemma);
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
  // instant local phonetic + 中文 for the capture card (no network),
  // persisted onto the stored record so review/dashboard get it too
  if (msg?.type === "phonetic" && msg.payload?.word) {
    (async () => {
      const info = await localQuick(msg.payload.word);
      try {
        const lemma = await resolveLemma(msg.payload.word);
        const k = KEY(lemma);
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
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // popup asks us to delete a word's cloud row
  if (msg?.type === "deleteWord" && msg.lemma) {
    deleteCloud(msg.lemma)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});
