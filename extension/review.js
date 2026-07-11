// review.js — in-extension spaced-repetition (SM-2) review. Pure local:
// reads/writes chrome.storage.local; if cloud sync is on, the background worker
// mirrors each graded card to InsForge.

const DAY = 86400000;
const NEW_PER_SESSION = 20; // cap brand-new cards per session
const card = document.getElementById("card");
const statsEl = document.getElementById("stats");

const KEY = (lemma) => "w:" + lemma;
const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();

let queue = []; // records to review this session
let current = null;
let session = { done: 0, total: 0 };

// ---- SM-2 -----------------------------------------------------------------
// rating: 1 again, 2 hard, 3 good, 4 easy. Returns patched SRS fields.
function schedule(rec, rating) {
  let ease = rec.ease || 2.5;
  let interval = rec.interval_days || 0;
  let reps = rec.reps || 0;
  let lapses = rec.lapses || 0;
  let state, dueMs;
  const isNew = (rec.state || "new") === "new" || reps === 0;

  if (rating === 1) {
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    state = "relearning";
    dueMs = now() + 10 * 60 * 1000; // ~10 min, comes back this session
  } else {
    if (isNew) {
      interval = rating === 4 ? 4 : 1; // easy 4d, hard/good 1d
      if (rating === 2) ease = Math.max(1.3, ease - 0.15);
      if (rating === 4) ease = ease + 0.15;
    } else if (rating === 2) {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round(interval * 1.2));
    } else if (rating === 3) {
      interval = Math.max(1, Math.round(interval * ease));
    } else {
      ease = ease + 0.15;
      interval = Math.max(1, Math.round(interval * ease * 1.3));
    }
    reps += 1;
    state = "review";
    interval = Math.min(interval, 3650); // cap at ~10y
    dueMs = now() + interval * DAY;
  }

  return {
    ease,
    interval_days: interval,
    reps,
    lapses,
    state,
    due: iso(dueMs),
    last_review: iso(now()),
    updated_at: iso(now()),
  };
}

// ---- storage --------------------------------------------------------------
async function loadDue() {
  const all = await chrome.storage.local.get(null);
  const words = Object.keys(all)
    .filter((k) => k.startsWith("w:"))
    .map((k) => all[k])
    .filter((w) => w.status === "active");
  const t = now();
  const due = words.filter((w) => new Date(w.due).getTime() <= t);
  // reviews first, then a capped number of brand-new cards
  const reviews = due.filter((w) => (w.reps || 0) > 0);
  const news = due.filter((w) => (w.reps || 0) === 0).slice(0, NEW_PER_SESSION);
  return reviews.concat(news);
}

async function saveRec(rec) {
  await chrome.storage.local.set({ [KEY(rec.lemma)]: rec });
  chrome.runtime.sendMessage({ type: "syncWord", record: rec }, () => void chrome.runtime.lastError);
}

// ---- free English definition + phonetic (best-effort, cached) --------------
async function dictLookup(lemma) {
  // inflected forms often miss (subpoenas → subpoena): strip common suffixes
  const cands = [lemma];
  if (/ies$/.test(lemma) && lemma.length > 4) cands.push(lemma.slice(0, -3) + "y");
  if (/s$/.test(lemma) && !/(ss|us|is)$/.test(lemma) && lemma.length > 3) cands.push(lemma.slice(0, -1));
  if (/ing$/.test(lemma) && lemma.length > 5) cands.push(lemma.slice(0, -3), lemma.slice(0, -3) + "e");
  if (/ed$/.test(lemma) && lemma.length > 4) cands.push(lemma.slice(0, -2), lemma.slice(0, -2) + "e");
  for (const c of cands) {
    try {
      const res = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(c));
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    } catch (_e) {}
  }
  return null;
}

const hasCJK = (s) => /[一-鿿]/.test(s || "");

// local dictionaries via the service worker — instant {phonetic, zh}
function localQuick(word) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "phonetic", payload: { word } }, (res) =>
        resolve(!chrome.runtime.lastError && res ? res : {})
      );
    } catch (_e) {
      resolve({});
    }
  });
}

// Normalize a record into { en, zh, phon } and migrate legacy fields:
// `definition` = English, `translation` = 中文. Older caches stored English
// dictionary text in `translation` — move it over.
async function ensureDef(rec) {
  let dirty = false;
  if (rec.translation && !hasCJK(rec.translation)) {
    if (!rec.definition) rec.definition = rec.translation;
    rec.translation = null;
    dirty = true;
  }
  let phon = rec.phonetic || null;
  let zh = rec.translation || null;
  let en = rec.definition || null;

  if (!phon || !zh) {
    const q = await localQuick(rec.lemma);
    if (!phon && q.phonetic) (phon = q.phonetic), (rec.phonetic = phon), (dirty = true);
    if (!zh && q.zh) (zh = q.zh), (rec.translation = zh), (dirty = true);
  }
  if (!en) {
    const data = await dictLookup(rec.lemma);
    if (data) {
      if (!phon) {
        for (const entry of data) {
          phon = entry.phonetic || (entry.phonetics || []).find((p) => p.text)?.text || null;
          if (phon) break;
        }
        if (phon) (rec.phonetic = phon), (dirty = true);
      }
      const out = [];
      for (const entry of data) {
        for (const m of entry.meanings || []) {
          const d = m.definitions && m.definitions[0];
          if (d && d.definition) out.push({ pos: m.partOfSpeech || "", def: d.definition });
          if (out.length >= 3) break;
        }
        if (out.length >= 3) break;
      }
      if (out.length) {
        en = out.map((o) => (o.pos ? `(${o.pos}) ` : "") + o.def).join("\n");
        rec.definition = en;
        dirty = true;
      }
    }
  }
  if (dirty) await chrome.storage.local.set({ [KEY(rec.lemma)]: rec });
  return { en, zh, phon };
}

// pronounce with the built-in speech engine — instant, offline
function speak(word) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (_e) {}
}

// ---- rendering ------------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function highlight(sentence, word) {
  const re = new RegExp("(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
  return esc(sentence).replace(re, "<mark>$1</mark>");
}

function renderStats() {
  statsEl.textContent = `${session.done}/${session.total} reviewed · ${queue.length} left`;
}

function renderDone() {
  card.innerHTML = `<div class="done"><div class="big">🎉</div>
    <p>Session complete — <b>${session.done}</b> cards reviewed.</p>
    <p style="font-size:13px;">Due words will reappear on schedule. You can close this tab.</p></div>`;
  statsEl.textContent = `Done: ${session.done}`;
}

const SPEAK_BTN = (w) =>
  `<button class="speak" data-word="${esc(w)}" title="Pronounce" style="border:none;background:none;font-size:20px;cursor:pointer;vertical-align:middle;">🔊</button>`;

function wirePhonRow(rec) {
  card.querySelectorAll(".speak").forEach((b) => b.addEventListener("click", () => speak(b.dataset.word)));
  const phonEl = document.getElementById("phon");
  if (!phonEl) return;
  if (rec.phonetic) phonEl.textContent = rec.phonetic;
  else localQuick(rec.lemma).then((q) => q.phonetic && (phonEl.textContent = q.phonetic));
}

function renderFront(rec) {
  card.innerHTML = `
    <div class="word">${esc(rec.word)} ${SPEAK_BTN(rec.word)}</div>
    <div class="phon" id="phon" style="text-align:center;color:#6b6b6b;font-size:16px;margin-top:4px;font-family:Charter,Georgia,serif;"></div>
    <div class="controls"><button class="reveal" id="reveal">Reveal (space)</button></div>`;
  document.getElementById("reveal").addEventListener("click", () => renderBack(rec));
  wirePhonRow(rec);
}

async function renderBack(rec) {
  const ctxItems = (rec.contexts && rec.contexts.length ? rec.contexts : rec.context ? [{ sentence: rec.context }] : [])
    .slice(-4)
    .reverse();
  const ctxHtml = ctxItems.length
    ? ctxItems
        .map(
          (c) =>
            `<div class="ctx">${highlight(c.sentence, rec.word)}` +
            (c.title || c.url ? `<span class="from">— ${esc(c.title || c.url)}</span>` : "") +
            `</div>`
        )
        .join("")
    : `<div class="ctx" style="color:#9ca3af">(no saved sentence)</div>`;

  card.innerHTML = `
    <div class="word">${esc(rec.word)} ${SPEAK_BTN(rec.word)}</div>
    <div class="phon" id="phon" style="text-align:center;color:#6b6b6b;font-size:16px;margin-top:4px;font-family:Charter,Georgia,serif;"></div>
    <div class="def" id="def">Looking it up…</div>
    <div style="margin:4px 0 8px;">
      <button id="zhBtn" style="font:600 12px/1 -apple-system,system-ui,sans-serif;color:#1a8917;background:#f0f7ef;border:1px solid #cfe6cd;border-radius:99px;padding:5px 10px;cursor:pointer;">中文</button>
      <div id="zhText" style="display:none;font-size:15px;margin-top:6px;color:#0f172a;"></div>
    </div>
    <div class="back" style="display:block">
      <div class="ctx-label">Context</div>
      ${ctxHtml}
    </div>
    <div class="controls">
      <button class="grade g1" data-g="1">Forgot<small>&lt;10 min</small></button>
      <button class="grade g2" data-g="2">Hard<small>1 day</small></button>
      <button class="grade g3" data-g="3">Good<small>${rec.reps ? Math.max(1, Math.round((rec.interval_days || 1) * (rec.ease || 2.5))) + " days" : "1 day"}</small></button>
      <button class="grade g4" data-g="4">Easy<small>${rec.reps ? Math.max(1, Math.round((rec.interval_days || 1) * (rec.ease || 2.5) * 1.3)) + " days" : "4 days"}</small></button>
    </div>`;

  card.querySelectorAll(".grade").forEach((b) =>
    b.addEventListener("click", () => grade(rec, parseInt(b.dataset.g, 10)))
  );

  wirePhonRow(rec);
  const { en, zh, phon } = await ensureDef(rec);
  if (current !== rec) return; // user already graded on — don't write onto the next card
  const defEl = document.getElementById("def");
  if (defEl) defEl.textContent = en || "(no dictionary entry — recall it from the sentence)";
  const phonEl = document.getElementById("phon");
  if (phonEl && phon) phonEl.textContent = phon;
  const zhBtn = document.getElementById("zhBtn");
  const zhText = document.getElementById("zhText");
  if (zhBtn && zhText) {
    if (!zh) zhBtn.style.display = "none";
    else
      zhBtn.addEventListener("click", () => {
        zhText.textContent = zh;
        zhText.style.display = "block";
        zhBtn.style.display = "none";
      });
  }
}

let grading = false;
async function grade(rec, rating) {
  if (grading || rec !== current) return; // ignore key auto-repeat / double taps
  grading = true;
  const patch = schedule(rec, rating);
  Object.assign(rec, patch);
  await saveRec(rec);
  session.done += 1;
  if (rating === 1) {
    // requeue near the end of this session
    queue.push(rec);
    session.total += 1; // keep the "done/total" stats honest
  }
  grading = false;
  next();
}

function next() {
  current = queue.shift() || null;
  renderStats();
  if (!current) return renderDone();
  renderFront(current);
}

// keyboard
document.addEventListener("keydown", (e) => {
  if (!current) return;
  const revealed = !!card.querySelector(".grade");
  if (e.code === "Space" && !revealed) {
    e.preventDefault();
    renderBack(current);
  } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
    grade(current, parseInt(e.key, 10));
  }
});

(async () => {
  queue = await loadDue();
  session.total = queue.length;
  renderStats();
  if (!queue.length) {
    card.innerHTML = `<div class="done"><div class="big">✅</div>
      <p>Nothing due right now.</p>
      <p style="font-size:13px;">Save more words while you read, or come back when reviews are due.</p></div>`;
    return;
  }
  next();
})();
