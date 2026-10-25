// content.js — capture words on selection. Works alongside Trancy: selecting a
// word triggers Trancy's popup AND shows a "Save to Echowords" button. Clicking it
// saves the word (with its sentence) and pops a small card: phonetic +
// plain-English explanation + a button that reveals the 中文 translation.
(() => {
  const BTN_ID = "__vocab_capture_btn__";
  const TOAST_ID = "__vocab_capture_toast__";
  const CARD_ID = "__vocab_mia_card__";
  let lastSelection = null;

  // --- learning languages (set in the options page) -----------------------
  let langs = ["en"];
  try {
    chrome.storage.local.get("miaLangs", (r) => {
      if (Array.isArray(r.miaLangs) && r.miaLangs.length) langs = r.miaLangs;
    });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.miaLangs && Array.isArray(ch.miaLangs.newValue)) langs = ch.miaLangs.newValue;
    });
  } catch (_e) {}

  const KANA_RE = /[぀-ゟ゠-ヿ]/;
  const HAN_RE = /[一-鿿㐀-䶿]/;
  const VALID = {
    en: /^[a-zA-Z][a-zA-Z'’ -]{1,59}$/,
    fr: /^[a-zA-ZÀ-ÿœŒçÇ][a-zA-ZÀ-ÿœŒçÇ'’ -]{1,59}$/,
    zh: /^[一-鿿㐀-䶿々]{1,8}$/,
    ja: /^[぀-ゟ゠-ヿ一-鿿㐀-䶿ー々]{1,12}$/,
  };
  const SPANISH_ALLOWED = /^[\p{L}\p{M}\s'’.,;:¡!¿?…«»"“”()\-–—]+$/u;

  function cleanSelection(text) {
    return String(text || "").normalize("NFC").replace(/\s+/g, " ").trim();
  }

  function validSelection(text, lang) {
    if (lang === "es") {
      return (
        text.length <= 120 &&
        text.split(/\s+/).length <= 12 &&
        /\p{L}/u.test(text) &&
        SPANISH_ALLOWED.test(text)
      );
    }
    return Boolean(VALID[lang]?.test(text));
  }

  // Which enabled language does this selection belong to? Script first
  // (kana → ja, han → zh/ja), then the page language, then enabled order.
  function detectLang(text, sel) {
    const anchor =
      sel?.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel?.anchorNode;
    const nearbyLang = anchor?.closest?.("[lang]")?.getAttribute("lang") || "";
    const pageLang = (nearbyLang || document.documentElement.lang || "").slice(0, 2).toLowerCase();
    if (KANA_RE.test(text)) return langs.includes("ja") ? "ja" : null;
    if (HAN_RE.test(text)) {
      if (langs.includes("zh") && langs.includes("ja")) return pageLang === "ja" ? "ja" : "zh";
      if (langs.includes("zh")) return "zh";
      if (langs.includes("ja")) return "ja";
      return null;
    }
    // Latin script: candidates among enabled latin languages, page lang wins
    const latin = langs.filter((l) => l === "en" || l === "es" || l === "fr");
    if (!latin.length) return null;
    if (langs.includes("es") && /[ñÑ¡¿]/.test(text)) return "es";
    const hasAccents = /[À-ÿœŒ]/.test(text);
    const cands = hasAccents ? latin.filter((l) => l !== "en") : latin;
    if (!cands.length) return null;
    if (cands.includes(pageLang)) return pageLang;
    return cands[0];
  }

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
    #${CARD_ID} .mia-speak{all:unset;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px;
      border-radius:6px;align-self:center;}
    #${CARD_ID} .mia-speak:hover{background:#f0f7ef;}
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
  btn.textContent = "★ Save to Echowords";
  document.documentElement.appendChild(btn);

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  document.documentElement.appendChild(toast);

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.innerHTML = `
    <div class="mia-head">
      <span class="mia-word"></span>
      <button class="mia-speak" title="Pronounce" aria-label="Pronounce">🔊</button>
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
  const cardSpeak = card.querySelector(".mia-speak");
  let cardLang = "en";
  const cardPlain = card.querySelector(".mia-plain");
  const cardZhBtn = card.querySelector(".mia-zh-btn");
  const cardZh = card.querySelector(".mia-zh");
  let cardZhText = null;
  let cardSeq = 0; // bumped per card; late async responses for older cards bail

  // pronounce with the browser's built-in speech engine — instant, offline, free
  const SPEAK_LANG = { en: "en-US", zh: "zh-CN", es: "es-ES", fr: "fr-FR", ja: "ja-JP" };
  function speak(text, lang) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEAK_LANG[lang] || "en-US";
      // Chrome's "Google …" voices sound far better than the OS defaults
      const voices = speechSynthesis.getVoices().filter((v) => v.lang === u.lang);
      u.voice = voices.find((v) => /google/i.test(v.name)) || voices.find((v) => v.localService) || voices[0] || null;
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (_e) {}
  }
  cardSpeak.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(cardWord.textContent, cardLang);
  });

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
    cardSeq++;
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
    let text = sel && sel.toString ? cleanSelection(sel.toString()) : "";
    if (text) return { sel, text };
    for (const node of path || []) {
      const root = node instanceof ShadowRoot ? node : node && node.shadowRoot;
      if (root && typeof root.getSelection === "function") {
        const s = root.getSelection();
        const t = s && s.toString ? cleanSelection(s.toString()) : "";
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

  // sendMessage throws "Extension context invalidated" from content scripts
  // that outlive an extension reload — catch it and ask for a page refresh.
  function sendToEchowords(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          showToast("Echowords was updated — refresh this page", true);
          cb && cb(null);
          return;
        }
        cb && cb(res);
      });
    } catch (_e) {
      showToast("Echowords was updated — refresh this page", true);
      cb && cb(null);
    }
  }

  function save(payload, cb) {
    sendToEchowords({ type: "capture", payload }, (res) => {
      if (res && res.ok) cb && cb();
      else if (res) showToast("Save failed: " + (res.error || "unknown error"), true);
    });
  }

  document.addEventListener("mouseup", (e) => {
    if (e.target === btn) return;
    // composedPath() must be read synchronously (it empties after dispatch)
    const path = e.composedPath ? e.composedPath() : [];
    setTimeout(() => {
      const { sel, text } = getSelectionData(path);
      // ignore empty / paragraph-sized selections
      if (!text || text.length > 120 || text.split(/\s+/).length > 12) {
        hideBtn();
        return;
      }
      // a real word or short phrase in one of the enabled learning languages.
      // rejects junk like "wprds_coach_api", codes, numbers, single letters.
      const lang = detectLang(text, sel);
      if (!lang || !validSelection(text, lang)) {
        hideBtn();
        return;
      }
      lastSelection = { word: text, lang, sentence: getSentence(sel, text) };
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
    const { word, lang, sentence } = lastSelection;
    const payload = {
      word,
      lang: lang || "en",
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
      cardLang = payload.lang;
      if (payload.lang === "zh") cardZhBtn.style.display = "none"; // the word IS Chinese
      const seq = cardSeq; // guard: ignore responses that outlive this card
      const stale = () => seq !== cardSeq;
      const setPlain = (text) => {
        cardPlain.textContent = text;
        cardPlain.className = "mia-plain";
      };
      // English meaning when the backend can't help (signed out, LLM down):
      // the free online dictionary, which has a short timeout of its own.
      const fallbackToDict = () =>
        sendToEchowords({ type: "dictdef", payload }, (res) => {
          if (stale()) return;
          if (res && res.phonetic && !cardPhon.textContent) cardPhon.textContent = res.phonetic;
          if (cardPlain.className.includes("loading")) setPlain(res && res.dictDef ? res.dictDef : "Saved.");
        });
      // stage 1 (~0ms): bundled dictionaries — phonetic + 中文, instantly.
      sendToEchowords({ type: "phonetic", payload }, (res) => {
        if (stale()) return;
        if (res && res.phonetic && !cardPhon.textContent) cardPhon.textContent = res.phonetic;
        if (res && res.zh) cardZhText = res.zh;
        // stage 2 (~1-2s): one LLM call for the plain-English meaning of the
        // exact sense in this sentence (plus 中文 when the dictionary missed)
        sendToEchowords({ type: "define", payload }, (llm) => {
          if (stale()) return;
          if (llm && llm.needsAuth) {
            showToast("Sign in to Echowords (extension icon → Sign in) for AI definitions & sync", true);
          }
          if (!llm || !llm.ok || !llm.plain) return fallbackToDict();
          if (llm.phonetic && !cardPhon.textContent) cardPhon.textContent = llm.phonetic;
          setPlain(llm.plain);
          if (llm.zh && !cardZhText) {
            cardZhText = llm.zh;
            if (cardZh.style.display === "block") cardZh.textContent = llm.zh;
          }
        });
      });
    });
  });
})();
