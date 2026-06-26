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

// ---- free English definition (best-effort, cached into translation) --------
async function ensureDef(rec) {
  if (rec.translation) return rec.translation;
  try {
    const res = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(rec.lemma));
    if (!res.ok) return null;
    const data = await res.json();
    const out = [];
    for (const entry of data) {
      for (const m of entry.meanings || []) {
        const d = m.definitions && m.definitions[0];
        if (d && d.definition) out.push({ pos: m.partOfSpeech || "", def: d.definition });
        if (out.length >= 3) break;
      }
      if (out.length >= 3) break;
    }
    if (!out.length) return null;
    const text = out.map((o) => (o.pos ? `(${o.pos}) ` : "") + o.def).join("\n");
    rec.translation = text;
    await chrome.storage.local.set({ [KEY(rec.lemma)]: rec }); // cache
    return text;
  } catch (_e) {
    return null;
  }
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
  statsEl.textContent = `本次 ${session.done}/${session.total} · 待复习 ${queue.length}`;
}

function renderDone() {
  card.innerHTML = `<div class="done"><div class="big">🎉</div>
    <p>本次复习完成!共复习 <b>${session.done}</b> 个词。</p>
    <p style="font-size:13px;">下次到期的词会自动出现。可以关掉这个标签页了。</p></div>`;
  statsEl.textContent = `完成 ${session.done}`;
}

function renderFront(rec) {
  card.innerHTML = `
    <div class="word">${esc(rec.word)}</div>
    <div class="src">${rec.source_url ? `<a href="${esc(rec.source_url)}" target="_blank">${esc(rec.source_title || rec.source_url)}</a>` : ""}</div>
    <div class="controls"><button class="reveal" id="reveal">显示答案 (空格)</button></div>`;
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
    : `<div class="ctx" style="color:#9ca3af">(没有保存例句)</div>`;

  card.innerHTML = `
    <div class="word">${esc(rec.word)}</div>
    <div class="def" id="def">查词中…</div>
    <div class="back" style="display:block">
      <div class="ctx-label">例句 / CONTEXT</div>
      ${ctxHtml}
    </div>
    <div class="controls">
      <button class="grade g1" data-g="1">忘了<small>&lt;10分钟</small></button>
      <button class="grade g2" data-g="2">难<small>1 天</small></button>
      <button class="grade g3" data-g="3">会<small>${rec.reps ? Math.max(1, Math.round((rec.interval_days || 1) * (rec.ease || 2.5))) + " 天" : "1 天"}</small></button>
      <button class="grade g4" data-g="4">简单<small>${rec.reps ? Math.max(1, Math.round((rec.interval_days || 1) * (rec.ease || 2.5) * 1.3)) + " 天" : "4 天"}</small></button>
    </div>`;

  card.querySelectorAll(".grade").forEach((b) =>
    b.addEventListener("click", () => grade(rec, parseInt(b.dataset.g, 10)))
  );

  const def = await ensureDef(rec);
  const defEl = document.getElementById("def");
  if (defEl) defEl.textContent = def || "(无在线释义,看例句记忆)";
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
      <p>现在没有到期需要复习的词。</p>
      <p style="font-size:13px;">去网页上多选些词,或等已存的词到期。</p></div>`;
    return;
  }
  next();
})();
