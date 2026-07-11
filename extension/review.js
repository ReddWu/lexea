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

async function ensureDef(rec) {
  if (rec.translation && rec.phonetic) return { def: rec.translation, phon: rec.phonetic };
  const data = await dictLookup(rec.lemma);
  let phon = rec.phonetic || null;
  let text = rec.translation || null;
  if (data) {
    if (!phon) {
      for (const entry of data) {
        phon = entry.phonetic || (entry.phonetics || []).find((p) => p.text)?.text || null;
        if (phon) break;
      }
    }
    if (!text) {
      const out = [];
      for (const entry of data) {
        for (const m of entry.meanings || []) {
          const d = m.definitions && m.definitions[0];
          if (d && d.definition) out.push({ pos: m.partOfSpeech || "", def: d.definition });
          if (out.length >= 3) break;
        }
        if (out.length >= 3) break;
      }
      if (out.length) text = out.map((o) => (o.pos ? `(${o.pos}) ` : "") + o.def).join("\n");
    }
    // cache whatever we learned
    let dirty = false;
    if (text && !rec.translation) (rec.translation = text), (dirty = true);
    if (phon && !rec.phonetic) (rec.phonetic = phon), (dirty = true);
    if (dirty) await chrome.storage.local.set({ [KEY(rec.lemma)]: rec });
  }
  return { def: text, phon };
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

function renderFront(rec) {
  card.innerHTML = `
    <div class="word">${esc(rec.word)}</div>
    <div class="src">${rec.source_url ? `<a href="${esc(rec.source_url)}" target="_blank">${esc(rec.source_title || rec.source_url)}</a>` : ""}</div>
    <div class="controls"><button class="reveal" id="reveal">Reveal (space)</button></div>`;
  document.getElementById("reveal").addEventListener("click", () => renderBack(rec));
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
    <div class="word">${esc(rec.word)}</div>
    <div class="phon" id="phon" style="text-align:center;color:#6b6b6b;font-size:16px;margin-top:4px;font-family:Charter,Georgia,serif;"></div>
    <div class="def" id="def">Looking it up…</div>
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

  const { def, phon } = await ensureDef(rec);
  const defEl = document.getElementById("def");
  if (defEl) defEl.textContent = def || "(no dictionary entry — recall it from the sentence)";
  const phonEl = document.getElementById("phon");
  if (phonEl && phon) phonEl.textContent = phon;
}

async function grade(rec, rating) {
  const patch = schedule(rec, rating);
  Object.assign(rec, patch);
  await saveRec(rec);
  session.done += 1;
  if (rating === 1) {
    // requeue near the end of this session
    queue.push(rec);
  }
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
