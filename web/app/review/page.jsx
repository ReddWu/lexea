"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { schedule } from "../../lib/srs";

const NEW_PER_SESSION = 20;

export default function Review() {
  const [queue, setQueue] = useState(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [def, setDef] = useState("Looking it up…");
  const [phon, setPhon] = useState("");
  const [zh, setZh] = useState("");
  const [zhShown, setZhShown] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/words", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);
        const now = Date.now();
        const due = (data.words || [])
          .filter((w) => (w.status === "active" || !w.status) && new Date(w.due).getTime() <= now);
        const reviews = due.filter((w) => (w.reps || 0) > 0);
        const news = due.filter((w) => (w.reps || 0) === 0).slice(0, NEW_PER_SESSION);
        const q = reviews.concat(news);
        setQueue(q);
        setTotal(q.length);
      } catch (e) {
        setError(String(e.message || e));
      }
    })();
  }, []);

  const current = queue && queue[0];

  // phonetic shows on the card front, before reveal
  useEffect(() => {
    setPhon(current?.phonetic || "");
  }, [current]);

  const reveal = useCallback(async () => {
    if (!current) return;
    const revealLemma = current.lemma; // guard: bail if user grades on before fetch lands
    const fresh = () => queue && queue[0] && queue[0].lemma === revealLemma;
    setRevealed(true);
    setPhon(current.phonetic || "");
    // definition = English; translation = 中文 (legacy rows stored English there)
    const isZh = hasCJK(current.translation);
    setZh(isZh ? current.translation : "");
    const enStored = current.definition || (!isZh ? current.translation : "");
    const hasEn = Boolean(enStored);
    setDef(hasEn ? enStored : "Looking it up…");
    if (hasEn && current.phonetic) return; // nothing left to look up
    if ((current.lang || "en") !== "en") {
      try {
        const r = await fetch("/api/define", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: current.word || current.lemma,
            lang: current.lang,
            context: current.context || current.contexts?.at(-1)?.sentence || "",
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || r.status);
        if (!fresh()) return;
        if (!hasEn) setDef(data.plain || "(definition unavailable)");
        if (!isZh && data.zh) setZh(data.zh);
        if (!current.phonetic && data.reading) setPhon(data.reading);
        const patch = {};
        if (!hasEn && data.plain) patch.definition = data.plain;
        if (!isZh && data.zh) patch.translation = data.zh;
        if (!current.phonetic && data.reading) patch.phonetic = data.reading;
        if (Object.keys(patch).length) {
          fetch("/api/words", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lemma: current.lemma, lang: current.lang, patch }),
          }).catch(() => {});
        }
      } catch {
        if (!hasEn && fresh()) setDef("(definition unavailable)");
      }
      return;
    }
    const noEntry = "(no dictionary entry — recall it from the sentence)";
    try {
      const lookup = (lemma) =>
        fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(lemma));
      let r = await lookup(current.lemma);
      if (r.status === 404) {
        const base = baseForm(current.lemma);
        if (base) r = await lookup(base);
      }
      if (!r.ok) {
        if (!hasEn && fresh()) setDef(noEntry);
        return;
      }
      const data = await r.json();
      if (!current.phonetic) {
        const entry = (data || []).find((e) => e.phonetic || e.phonetics?.find((p) => p.text));
        const text = entry ? entry.phonetic || entry.phonetics?.find((p) => p.text)?.text : "";
        if (text) {
          if (fresh()) setPhon(text);
          fetch("/api/words", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lemma: current.lemma, lang: current.lang || "en", patch: { phonetic: text } }),
          }).catch(() => {});
        }
      }
      if (!hasEn) {
        const out = [];
        for (const entry of data) {
          for (const m of entry.meanings || []) {
            const d = m.definitions && m.definitions[0];
            if (d?.definition) out.push((m.partOfSpeech ? `(${m.partOfSpeech}) ` : "") + d.definition);
            if (out.length >= 3) break;
          }
          if (out.length >= 3) break;
        }
        if (fresh()) setDef(out.length ? out.join("\n") : noEntry);
      }
    } catch {
      if (!hasEn && fresh()) setDef(noEntry);
    }
  }, [current, queue]);

  const grade = useCallback(
    (rating) => {
      if (!current) return;
      const patch = schedule(current, rating);
      fetch("/api/words", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma: current.lemma, lang: current.lang || "en", patch }),
      }).catch(() => {});
      setDone((d) => d + 1);
      setQueue((q) => {
        const rest = q.slice(1);
        if (rating === 1) {
          rest.push({ ...current, ...patch }); // "again" returns this session
          setTotal((t) => t + 1); // keep done/total honest
        }
        return rest;
      });
      setRevealed(false);
      setDef("Looking it up…");
      setPhon("");
      setZh("");
      setZhShown(false);
    },
    [current]
  );

  // keyboard: space reveal, 1–4 grade
  useEffect(() => {
    const onKey = (e) => {
      if (!current) return;
      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        grade(parseInt(e.key, 10));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, reveal, grade]);

  return (
    <div className="review-wrap">
      <div className="header" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", background: "#fff" }}>
        <Link href="/">← Library</Link>
        <span className="sub">{queue ? `${done}/${total} reviewed · ${queue.length} left` : ""}</span>
      </div>
      <div className="review-main">
        <div className="flash">
          {error ? (
            <div className="done">Failed to load: {error}</div>
          ) : !queue ? (
            "Loading…"
          ) : !current ? (
            total === 0 ? (
              <div className="done">
                <div className="big">✅</div>
                <p>Nothing due right now.</p>
                <p className="sub">Save more words while you read, or come back when reviews are due.</p>
              </div>
            ) : (
              <div className="done">
                <div className="big">🎉</div>
                <p>Session complete — <b>{done}</b> cards reviewed.</p>
                <Link className="btn blue" href="/">Back to library</Link>
              </div>
            )
          ) : (
            <Card card={current} revealed={revealed} def={def} phon={phon} zh={zh} zhShown={zhShown} onShowZh={() => setZhShown(true)} onReveal={reveal} onGrade={grade} />
          )}
        </div>
      </div>
      {current && <div className="hintbar">Space = reveal · 1 forgot / 2 hard / 3 good / 4 easy</div>}
    </div>
  );
}

function Card({ card, revealed, def, phon, zh, zhShown, onShowZh, onReveal, onGrade }) {
  const contexts = (card.contexts && card.contexts.length ? card.contexts : card.context ? [{ sentence: card.context }] : [])
    .slice(-4)
    .reverse();
  return (
    <>
      <div className="word">
        {card.word}{" "}
        <button
          onClick={() => speak(card.word, card.lang)}
          title="Pronounce"
          style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", verticalAlign: "middle" }}
        >
          🔊
        </button>
      </div>
      {phon ? (
        <div style={{ color: "var(--muted)", fontSize: 16, textAlign: "center", marginTop: 4, fontFamily: "var(--serif)" }}>
          {phon}
        </div>
      ) : null}
      {!revealed ? (
        <div className="controls">
          <button className="g g3 reveal" onClick={onReveal}>
            Reveal (space)
          </button>
        </div>
      ) : (
        <>
          <div className="def">{def}</div>
          {zh ? (
            zhShown ? (
              <div style={{ fontSize: 16, margin: "2px 0 10px", color: "#0f172a" }}>{zh}</div>
            ) : (
              <button
                onClick={onShowZh}
                style={{ font: "600 12px/1 var(--sans)", color: "var(--green)", background: "#f0f7ef", border: "1px solid #cfe6cd", borderRadius: 99, padding: "5px 10px", cursor: "pointer", marginBottom: 10 }}
              >
                中文
              </button>
            )
          ) : null}
          <div className="ctx-label">Context</div>
          {contexts.length ? (
            contexts.map((c, i) => (
              <div className="ctx" key={i}>
                {highlight(c.sentence, card.word)}
                {c.title || c.url ? <span className="from">— {c.title || c.url}</span> : null}
              </div>
            ))
          ) : (
            <div className="ctx" style={{ color: "#9ca3af" }}>
              (no saved sentence)
            </div>
          )}
          <div className="controls">
            <button className="g g1" onClick={() => onGrade(1)}>
              Forgot<small>&lt;10 min</small>
            </button>
            <button className="g g2" onClick={() => onGrade(2)}>
              Hard<small>1 day</small>
            </button>
            <button className="g g3" onClick={() => onGrade(3)}>
              Good
            </button>
            <button className="g g4" onClick={() => onGrade(4)}>
              Easy
            </button>
          </div>
        </>
      )}
    </>
  );
}

const hasCJK = (s) => /[一-鿿]/.test(s || "");

function speak(word, lang = "en") {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = { en: "en-US", zh: "zh-CN", es: "es-ES", fr: "fr-FR", ja: "ja-JP" }[lang] || "en-US";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (_e) {}
}

// conservative base-form guess for dictionary retry: "subpoenas" → "subpoena"
function baseForm(lemma) {
  const w = String(lemma).toLowerCase();
  if (w.length > 4 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return null;
}

function highlight(sentence, word) {
  const re = new RegExp("(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
  const parts = String(sentence).split(re);
  const wl = word.toLowerCase();
  return parts.map((p, i) => (p.toLowerCase() === wl ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}
