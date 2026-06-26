// background.js — local-first store. Words live in chrome.storage.local
// (one key per word: "w:<lemma>"). If the user opts into cloud sync, each
// capture is ALSO mirrored to their InsForge project (best-effort, non-blocking).

const KEY = (lemma) => "w:" + lemma;
const nowISO = () => new Date().toISOString();

async function getCloud() {
  const { cloudUrl, cloudKey, cloudSync } = await chrome.storage.local.get([
    "cloudUrl",
    "cloudKey",
    "cloudSync",
  ]);
  const url = (cloudUrl || "").replace(/\/+$/, "");
  return { url, key: cloudKey || "", on: !!cloudSync && !!url && !!cloudKey };
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
  const lemma = (p.word || "").trim().toLowerCase();
  if (!lemma) throw new Error("空词");
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
    rec.word = p.word.trim();
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

// Mirror the locally-merged record to InsForge by upserting on `lemma`.
// PATCH first (existing word); if nothing matched, POST a new row. We never
// send `id` (DB-generated) or `times_used_in_chat` (owned by openclaw).
function cloudBody(rec) {
  const { id, times_used_in_chat, ...rest } = rec;
  return rest;
}

async function pushCloud(rec) {
  const { url, key, on } = await getCloud();
  if (!on) return;
  const base = `${url}/api/database/records/words`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };
  const body = cloudBody(rec);
  try {
    const res = await fetch(`${base}?lemma=eq.${encodeURIComponent(rec.lemma)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) return; // updated existing
    }
    // not found -> insert (POST body must be an array)
    await fetch(base, { method: "POST", headers, body: JSON.stringify([body]) });
  } catch (_e) {
    // best-effort; local is the source of truth
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
});
