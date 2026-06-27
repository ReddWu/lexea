// content.js — capture words on selection. Works alongside Trancy: selecting a
// word triggers Trancy's popup AND (optionally) auto-saves to your library.
(() => {
  const BTN_ID = "__vocab_capture_btn__";
  const TOAST_ID = "__vocab_capture_toast__";
  let lastSelection = null;

  // config (live-updated)
  let autoSave = true; // default: selecting a single word auto-saves
  let lastSavedText = ""; // guard against double-saving the same selection
  chrome.storage.local.get("autoSave").then((v) => {
    if (typeof v.autoSave === "boolean") autoSave = v.autoSave;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.autoSave) autoSave = !!changes.autoSave.newValue;
  });

  // --- styles (injected once) -------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #${BTN_ID}{position:absolute;z-index:2147483647;display:none;
      font:600 13px/1 -apple-system,system-ui,sans-serif;color:#fff;
      background:#2563eb;border:none;border-radius:8px;padding:7px 11px;
      box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;}
    #${BTN_ID}:hover{background:#1d4ed8;}
    #${BTN_ID}:active{transform:translateY(1px);}
    #${TOAST_ID}{position:fixed;z-index:2147483647;left:50%;bottom:28px;
      transform:translateX(-50%);display:none;max-width:80vw;
      font:500 13px/1.4 -apple-system,system-ui,sans-serif;color:#fff;
      background:#111827;border-radius:10px;padding:10px 14px;
      box-shadow:0 6px 20px rgba(0,0,0,.3);}
    #${TOAST_ID}.err{background:#b91c1c;}
  `;
  document.documentElement.appendChild(style);

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.textContent = "★ 存入单词本";
  document.documentElement.appendChild(btn);

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  document.documentElement.appendChild(toast);

  function showToast(msg, isErr) {
    toast.textContent = msg;
    toast.className = isErr ? "err" : "";
    toast.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.style.display = "none"), 2000);
  }

  // Get selected text, looking through open shadow roots too. Sites like Reddit
  // / YouTube render content inside Shadow DOM, where window.getSelection() comes
  // back empty. The mouseup event's composedPath() exposes those shadow roots.
  function getSelectionData(path) {
    let sel = window.getSelection();
    let text = sel && sel.toString ? sel.toString().trim() : "";
    if (text) return { sel, text };
    for (const node of path || []) {
      const root = node instanceof ShadowRoot ? node : node && node.shadowRoot;
      if (root && typeof root.getSelection === "function") {
        const s = root.getSelection();
        const t = s && s.toString ? s.toString().trim() : "";
        if (t) return { sel: s, text: t };
      }
    }
    return { sel: null, text: "" };
  }

  // Find the sentence that contains the selection by walking up to a block
  // element and splitting its text on sentence delimiters.
  function getSentence(sel, selText) {
    if (!sel || !sel.anchorNode) return selText;
    let node = sel.anchorNode;
    let el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = el
      ? el.closest("p,li,td,th,dd,blockquote,article,section,figcaption,h1,h2,h3,h4,h5,h6,div") || el
      : null;
    const text = (block ? block.innerText : selText).replace(/\s+/g, " ").trim();
    if (!text) return selText;
    const parts = text.match(/[^.!?。！？\n]+[.!?。！？]?/g) || [text];
    const hit = parts.find((p) => p.includes(selText));
    return (hit || text).trim().slice(0, 600);
  }

  function hideBtn() {
    btn.style.display = "none";
  }

  function save(payload) {
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      if (chrome.runtime.lastError) {
        showToast("保存失败:扩展未就绪", true);
        return;
      }
      if (res && res.ok) showToast("✓ 已保存:" + payload.word);
      else showToast("保存失败:" + (res?.error || "未知错误"), true);
    });
  }

  document.addEventListener("mouseup", (e) => {
    if (e.target === btn) return;
    // composedPath() must be read synchronously (it empties after dispatch)
    const path = e.composedPath ? e.composedPath() : [];
    setTimeout(() => {
      const { sel, text } = getSelectionData(path);
      // ignore empty / paragraph-sized selections
      if (!text || text.length > 60 || text.split(/\s+/).length > 5) {
        hideBtn();
        return;
      }
      const sentence = getSentence(sel, text);
      // a real word: starts with a letter, only letters/apostrophe/hyphen, len 2–40.
      // rejects junk like "wprds_coach_api", codes, numbers, single letters.
      const isSingleWord = /^[a-zA-Z][a-zA-Z'’-]{1,39}$/.test(text);

      // auto-save single words silently; leave the selection intact so Trancy's
      // popup is unaffected and we never clear what you highlighted.
      if (autoSave && isSingleWord) {
        if (text.toLowerCase() === lastSavedText) return;
        lastSavedText = text.toLowerCase();
        save({ word: text, context: sentence, url: location.href, title: document.title });
        hideBtn();
        return;
      }

      // otherwise (phrases, or auto-save off) show the manual button
      lastSelection = { word: text, sentence };
      btn.style.left = e.pageX + "px";
      btn.style.top = e.pageY + 14 + "px";
      btn.style.display = "block";
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target !== btn) {
      hideBtn();
      lastSavedText = ""; // a fresh click starts a new selection
    }
  });
  document.addEventListener("scroll", hideBtn, true);

  btn.addEventListener("click", () => {
    if (!lastSelection) return;
    const payload = {
      word: lastSelection.word,
      context: lastSelection.sentence,
      url: location.href,
      title: document.title,
    };
    hideBtn();
    window.getSelection()?.removeAllRanges();
    save(payload);
  });
})();
