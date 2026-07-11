// options.js — Mia extension settings: backend URL + manual sync helpers.
const $ = (id) => document.getElementById(id);
const DEFAULT_BASE = "https://mia.butterbase.dev";

async function base() {
  const { miaBase } = await chrome.storage.local.get("miaBase");
  return (miaBase || DEFAULT_BASE).replace(/\/+$/, "");
}

function status(msg, ok = true) {
  $("status").textContent = msg;
  $("status").style.color = ok ? "#1a8917" : "#c94a4a";
}

async function localWords() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith("w:"))
    .map((k) => all[k]);
}

(async () => {
  const { miaBase } = await chrome.storage.local.get("miaBase");
  $("miaBase").value = miaBase || DEFAULT_BASE;
})();

$("save").addEventListener("click", async () => {
  const v = $("miaBase").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ miaBase: v || DEFAULT_BASE });
  status("✓ Saved");
});

$("test").addEventListener("click", async () => {
  status("Testing…");
  try {
    const res = await fetch(`${await base()}/api/words`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    status(`✓ Connected — ${data.words.length} words in the cloud`);
  } catch (e) {
    status(`✗ ${e.message || e}`, false);
  }
});

$("backfill").addEventListener("click", async () => {
  const words = await localWords();
  if (!words.length) return status("No local words to upload", false);
  status(`Uploading 0/${words.length}…`);
  const b = await base();
  let ok = 0,
    fail = 0;
  for (const rec of words) {
    const { id, times_used_in_chat, ...body } = rec;
    try {
      const res = await fetch(`${b}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      res.ok ? ok++ : fail++;
    } catch {
      fail++;
    }
    status(`Uploading ${ok + fail}/${words.length}…`);
  }
  status(fail ? `Done: ${ok} uploaded, ${fail} failed` : `✓ All ${ok} words uploaded`, !fail);
});

$("pull").addEventListener("click", async () => {
  status("Pulling…");
  try {
    const res = await fetch(`${await base()}/api/words`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    const local = await chrome.storage.local.get(null);
    let added = 0;
    for (const w of data.words || []) {
      const k = "w:" + w.lemma;
      if (!local[k]) {
        const { id, ...rec } = w;
        await chrome.storage.local.set({ [k]: rec });
        added++;
      }
    }
    status(`✓ Pulled ${added} new word${added === 1 ? "" : "s"}`);
  } catch (e) {
    status(`✗ ${e.message || e}`, false);
  }
});
