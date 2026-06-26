const $ = (id) => document.getElementById(id);

// read all words from local storage (source of truth)
async function allWords() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith("w:"))
    .map((k) => all[k])
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
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
    .slice(0, 15)
    .map(
      (w) =>
        `<li><div class="w">${escapeHtml(w.word)}</div>` +
        (w.context ? `<div class="c">${escapeHtml(w.context)}</div>` : "") +
        `</li>`
    )
    .join("");
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

  $("csv").addEventListener("click", async () => {
    const w = await allWords();
    download("vocab.csv", toCSV(w), "text/csv");
  });
  $("json").addEventListener("click", async () => {
    const w = await allWords();
    download("vocab.json", JSON.stringify(w, null, 2), "application/json");
  });
  $("opt").addEventListener("click", () => chrome.runtime.openOptionsPage());
})();
