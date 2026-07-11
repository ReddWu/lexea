// content.js — capture words on selection. Works alongside Trancy: selecting a
// word triggers Trancy's popup AND shows a "Save to Mia" button. Clicking it
// saves the word (with its sentence) and pops a small card: phonetic +
// plain-English explanation + a button that reveals the 中文 translation.
(() => {
  const BTN_ID = "__vocab_capture_btn__";
  const TOAST_ID = "__vocab_capture_toast__";
  const CARD_ID = "__vocab_mia_card__";
  let lastSelection = null;

  // --- styles (injected once) -------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #${BTN_ID}{position:absolute;z-index:2147483647;display:none;
      font:600 13px/1 -apple-system,system-ui,sans-serif;color:#fff;
      background:#1a8917;border:none;border-radius:99px;padding:7px 11px;
      box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;}
    #${BTN_ID}:hover{background:#156d12;}
    #${BTN_ID}:active{transform:translateY(1px);}
    #${TOAST_ID}{position:fixed;z-index:2147483647;left:50%;bottom:28px;
      transform:translateX(-50%);display:none;max-width:80vw;
      font:500 13px/1.4 -apple-system,system-ui,sans-serif;color:#fff;
      background:#111827;border-radius:10px;padding:10px 14px;
      box-shadow:0 6px 20px rgba(0,0,0,.3);}
    #${TOAST_ID}.err{background:#b91c1c;}
    #${CARD_ID}{position:absolute;z-index:2147483647;display:none;width:300px;
      font:400 13px/1.5 -apple-system,system-ui,sans-serif;color:#111827;
      background:#fff;border:1px solid #e6e6e6;border-radius:10px;
      box-shadow:0 8px 30px rgba(0,0,0,.18);padding:12px 14px;text-align:left;}
    #${CARD_ID} .mia-head{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;}
    #${CARD_ID} .mia-word{font-weight:700;font-size:16px;}
    #${CARD_ID} .mia-phon{color:#6b7280;font-size:13px;}
    #${CARD_ID} .mia-saved{margin-left:auto;color:#1a8917;font-size:11px;font-weight:600;}
    #${CARD_ID} .mia-plain{color:#111827;margin-bottom:8px;}
    #${CARD_ID} .mia-plain.loading{color:#9ca3af;}
    #${CARD_ID} .mia-zh-btn{font:600 12px/1 -apple-system,system-ui,sans-serif;
      color:#1a8917;background:#f0f7ef;border:1px solid #cfe6cd;border-radius:99px;
      padding:5px 9px;cursor:pointer;}
    #${CARD_ID} .mia-zh-btn:hover{background:#e2f0e0;}
    #${CARD_ID} .mia-zh{display:none;margin-top:6px;color:#0f172a;font-size:14px;}
  `;
  document.documentElement.appendChild(style);

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.textContent = "★ Save to Mia";
  document.documentElement.appendChild(btn);

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  document.documentElement.appendChild(toast);

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.innerHTML = `
    <div class="mia-head">
      <span class="mia-word"></span>
      <span class="mia-phon"></span>
      <span class="mia-saved">✓ saved</span>
    </div>
    <div class="mia-plain loading">Looking it up…</div>
    <button class="mia-zh-btn">中文</button>
    <div class="mia-zh"></div>
  `;
  document.documentElement.appendChild(card);
  const cardWord = card.querySelector(".mia-word");
  const cardPhon = card.querySelector(".mia-phon");
  const cardPlain = card.querySelector(".mia-plain");
  const cardZhBtn = card.querySelector(".mia-zh-btn");
  const cardZh = card.querySelector(".mia-zh");
  let cardZhText = null;

  cardZhBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cardZh.textContent = cardZhText || "(translation unavailable)";
    cardZh.style.display = "block";
    cardZhBtn.style.display = "none";
  });
  card.addEventListener("mousedown", (e) => e.stopPropagation());
  card.addEventListener("mouseup", (e) => e.stopPropagation());

  function showToast(msg, isErr) {
    toast.textContent = msg;
    toast.className = isErr ? "err" : "";
    toast.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.style.display = "none"), 2000);
  }

  function hideBtn() {
    btn.style.display = "none";
  }
  function hideCard() {
    card.style.display = "none";
    cardZh.style.display = "none";
    cardZh.textContent = "";
    cardZhBtn.style.display = "inline-block";
    cardZhText = null;
  }

  function showCard(x, y, word) {
    cardWord.textContent = word;
    cardPhon.textContent = "";
    cardPlain.textContent = "Looking it up…";
    cardPlain.className = "mia-plain loading";
    card.style.left = x + "px";
    card.style.top = y + 14 + "px";
    card.style.display = "block";
    // keep the card on-screen horizontally
    const r = card.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) {
      card.style.left = Math.max(8, x - (r.right - window.innerWidth) - 8) + "px";
    }
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

  function save(payload, cb) {
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      if (chrome.runtime.lastError) {
        showToast("Save failed: extension not ready", true);
        return;
      }
      if (res && res.ok) cb && cb();
      else showToast("Save failed: " + (res?.error || "unknown error"), true);
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
      // a real word or short phrase: letters/apostrophe/hyphen/space, len 2–60.
      // rejects junk like "wprds_coach_api", codes, numbers, single letters.
      if (!/^[a-zA-Z][a-zA-Z'’ -]{1,59}$/.test(text)) {
        hideBtn();
        return;
      }
      lastSelection = { word: text, sentence: getSentence(sel, text) };
      btn.style.left = e.pageX + "px";
      btn.style.top = e.pageY + 14 + "px";
      btn.style.display = "block";
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target !== btn) {
      hideBtn();
      hideCard();
    }
  });
  document.addEventListener("scroll", () => {
    hideBtn();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideBtn();
      hideCard();
    }
  });

  btn.addEventListener("click", () => {
    if (!lastSelection) return;
    const { word, sentence } = lastSelection;
    const payload = {
      word,
      context: sentence,
      url: location.href,
      title: document.title,
    };
    const x = parseInt(btn.style.left, 10) || 0;
    const y = parseInt(btn.style.top, 10) || 0;
    hideBtn();
    window.getSelection()?.removeAllRanges();

    save(payload, () => {
      showCard(x, y, word);
      // fetch phonetic + plain definition + 中文 (background does the network)
      chrome.runtime.sendMessage({ type: "define", payload }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          cardPlain.textContent = "Saved. (definition unavailable)";
          cardPlain.className = "mia-plain";
          return;
        }
        if (res.phonetic) cardPhon.textContent = res.phonetic;
        cardPlain.textContent = res.plain || "Saved.";
        cardPlain.className = "mia-plain";
        cardZhText = res.zh || null;
      });
    });
  });
})();
