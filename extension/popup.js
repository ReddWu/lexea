const $ = (id) => document.getElementById(id);

// read all words from local storage (source of truth)
async function allWords() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith("w:"))
    .map((k) => all[k])
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

// weakness score — same formula as functions/weak-words.ts (weakest first)
function score(w) {
  const now = Date.now();
  let s = 0;
  if (new Date(w.due).getTime() <= now) s += 2;
  if (w.state === "relearning") s += 3;
  s += (w.lapses || 0) * 2;
  if ((w.reps || 0) === 0) s += 1;
  s -= (w.reps || 0) * 0.2;
  s -= Math.max(0, (w.ease || 2.5) - 2.5);
  s -= (w.times_used_in_chat || 0) * 0.3;
  return s;
}

function weakRanked(words, limit) {
  return words
    .map((w) => ({ w, s: score(w) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.w);
}

function buildInstruction(words) {
  const list = weakRanked(words, 30)
    .map((w) => w.word)
    .join(", ");
  return (
    "I'm a Chinese native speaker learning English. In your replies, naturally and correctly use some of " +
    "the English words I'm practicing (listed below) whenever they genuinely fit the topic — prioritize the " +
    "ones earlier in the list. Don't force them, don't list or define them, and don't add other " +
    '"vocabulary words" of your own; just weave mine into fluent, natural sentences. Add a short Chinese ' +
    "gloss in parentheses only for a genuinely hard one. If none fit naturally, just reply normally.\n\n" +
    "My words (weakest first): " +
    list
  );
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCSV(rows) {
  const cols = ["word", "lemma", "translation", "context", "source_url", "due", "reps", "lapses", "created_at"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function render(words) {
  $("count").textContent = `共 ${words.length} 词`;
  if (!words.length) {
    $("empty").style.display = "block";
    $("list").innerHTML = "";
    return;
  }
  $("empty").style.display = "none";
  $("list").innerHTML = words
    .map(
      (w) =>
        `<li><button class="del" data-lemma="${escapeHtml(w.lemma)}" title="删除">✕</button>` +
        `<div class="w">${escapeHtml(w.word)}</div>` +
        (w.context ? `<div class="c">${escapeHtml(w.context)}</div>` : "") +
        `</li>`
    )
    .join("");
  $("list")
    .querySelectorAll(".del")
    .forEach((b) => b.addEventListener("click", () => deleteWord(b.dataset.lemma)));
}

async function deleteWord(lemma) {
  await chrome.storage.local.remove("w:" + lemma);
  chrome.runtime.sendMessage({ type: "deleteWord", lemma }, () => void chrome.runtime.lastError);
  render(await allWords());
}

(async () => {
  const words = await allWords();
  render(words);

  // due-now count for the review button
  const t = Date.now();
  const dueCount = words.filter((w) => w.status === "active" && new Date(w.due).getTime() <= t).length;
  $("due").textContent = dueCount ? `(${dueCount})` : "";

  $("review").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
  });

  $("copy").addEventListener("click", async () => {
    const w = await allWords();
    if (!w.length) {
      $("copyStatus").textContent = "还没有单词";
      return;
    }
    try {
      await navigator.clipboard.writeText(buildInstruction(w));
      $("copyStatus").textContent = "✓ 已复制 · 粘进 ChatGPT 设置 → 个性化 → 自定义指令";
    } catch (_e) {
      $("copyStatus").textContent = "复制失败,请重试";
    }
  });

  $("csv").addEventListener("click", async () => {
    const w = await allWords();
    download("vocab.csv", toCSV(w), "text/csv");
  });
  $("json").addEventListener("click", async () => {
    const w = await allWords();
    download("vocab.json", JSON.stringify(w, null, 2), "application/json");
  });
  $("opt").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
})();
