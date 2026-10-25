// options.js — Echowords extension settings: account, learning languages, backend
// URL + manual sync helpers. All cloud calls go through the background service
// worker, which owns the auth token.
const $ = (id) => document.getElementById(id);
const DEFAULT_BASE = "https://mia-tutor.vercel.app";

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

// --- account ----------------------------------------------------------------
function renderAccount() {
  chrome.runtime.sendMessage({ type: "authStatus" }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      $("accountWho").textContent = "Extension not ready — reload it";
      return;
    }
    if (res.signedIn) {
      $("accountWho").textContent = `Signed in as ${res.email || res.name}`;
      $("accountBtn").textContent = "Sign out";
      $("accountBtn").onclick = () =>
        chrome.runtime.sendMessage({ type: "signOut" }, () => renderAccount());
    } else {
      $("accountWho").textContent = "Not signed in";
      $("accountBtn").textContent = "Sign in with Google";
      $("accountBtn").onclick = () => {
        $("accountBtn").textContent = "Waiting for Google…";
        chrome.runtime.sendMessage({ type: "signIn" }, (r) => {
          if (r && !r.ok && r.error) status(`✗ ${r.error}`, false);
          renderAccount();
        });
      };
    }
  });
}
renderAccount();

// --- learning languages (saved on change) ------------------------------------
(async () => {
  const { miaLangs } = await chrome.storage.local.get("miaLangs");
  const active = Array.isArray(miaLangs) && miaLangs.length ? miaLangs : ["en"];
  document.querySelectorAll(".langs input").forEach((cb) => {
    cb.checked = active.includes(cb.dataset.lang);
    cb.addEventListener("change", async () => {
      const picked = [...document.querySelectorAll(".langs input")]
        .filter((c) => c.checked)
        .map((c) => c.dataset.lang);
      if (!picked.length) {
        cb.checked = true; // at least one language stays on
        return;
      }
      await chrome.storage.local.set({ miaLangs: picked });
      status("✓ Languages saved");
    });
  });
})();

// --- backend URL --------------------------------------------------------------
(async () => {
  const { miaBase } = await chrome.storage.local.get("miaBase");
  $("miaBase").value = miaBase || DEFAULT_BASE;
})();

$("save").addEventListener("click", async () => {
  const v = $("miaBase").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ miaBase: v || DEFAULT_BASE });
  status("✓ Saved");
});

$("test").addEventListener("click", () => {
  status("Testing…");
  chrome.runtime.sendMessage({ type: "testCloud" }, (res) => {
    if (chrome.runtime.lastError) return status("✗ extension not ready", false);
    if (res?.ok) status(`✓ Connected — ${res.count} words in the cloud`);
    else status(`✗ ${res?.error || "failed"}`, false);
  });
});

// --- manual sync ---------------------------------------------------------------
$("backfill").addEventListener("click", async () => {
  const words = await localWords();
  if (!words.length) return status("No local words to upload", false);
  status(`Uploading 0/${words.length}…`);
  let ok = 0,
    fail = 0;
  for (const rec of words) {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "syncWord", record: rec }, (res) => {
        void chrome.runtime.lastError;
        res?.ok ? ok++ : fail++;
        resolve();
      });
    });
    status(`Uploading ${ok + fail}/${words.length}…`);
  }
  status(fail ? `Done: ${ok} uploaded, ${fail} failed` : `✓ All ${ok} words uploaded`, !fail);
});

$("pull").addEventListener("click", () => {
  status("Pulling…");
  chrome.runtime.sendMessage({ type: "pullWords" }, (res) => {
    if (chrome.runtime.lastError) return status("✗ extension not ready", false);
    if (res?.ok) status(`✓ Pulled ${res.added} new word${res.added === 1 ? "" : "s"}`);
    else status(`✗ ${res?.error || "failed"}`, false);
  });
});
