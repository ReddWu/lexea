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
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/words", { cache: "no-store" });
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

  const reveal = useCallback(async () => {
    if (!current) return;
    setRevealed(true);
    setPhon(current.phonetic || "");
    const hasTranslation = Boolean(current.translation);
    setDef(hasTranslation ? current.translation : "Looking it up…");
    if (hasTranslation && current.phonetic) return; // nothing left to look up
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
        if (!hasTranslation) setDef(noEntry);
        return;
      }
      const data = await r.json();
      if (!current.phonetic) {
        const entry = (data || []).find((e) => e.phonetic || e.phonetics?.find((p) => p.text));
        const text = entry ? entry.phonetic || entry.phonetics?.find((p) => p.text)?.text : "";
        if (text) {
          setPhon(text);
          fetch("/api/words", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lemma: current.lemma, patch: { phonetic: text } }),
          }).catch(() => {});
        }
      }
      if (!hasTranslation) {
        const out = [];
        for (const entry of data) {
          for (const m of entry.meanings || []) {
            const d = m.definitions && m.definitions[0];
            if (d?.definition) out.push((m.partOfSpeech ? `(${m.partOfSpeech}) ` : "") + d.definition);
            if (out.length >= 3) break;
          }
          if (out.length >= 3) break;
        }
        setDef(out.length ? out.join("\n") : noEntry);
      }
    } catch {
      if (!hasTranslation) setDef(noEntry);
    }
  }, [current]);

  const grade = useCallback(
    (rating) => {
      if (!current) return;
      const patch = schedule(current, rating);
      fetch("/api/words", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma: current.lemma, patch }),
      }).catch(() => {});
      setDone((d) => d + 1);
      setQueue((q) => {
        const rest = q.slice(1);
        if (rating === 1) rest.push({ ...current, ...patch }); // "again" returns this session
        return rest;
      });
      setRevealed(false);
      setDef("Looking it up…");
      setPhon("");
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
            <Card card={current} revealed={revealed} def={def} phon={phon} onReveal={reveal} onGrade={grade} />
          )}
        </div>
      </div>
      {current && <div className="hintbar">Space = reveal · 1 forgot / 2 hard / 3 good / 4 easy</div>}
    </div>
  );
}

function Card({ card, revealed, def, phon, onReveal, onGrade }) {
  const contexts = (card.contexts && card.contexts.length ? card.contexts : card.context ? [{ sentence: card.context }] : [])
    .slice(-4)
    .reverse();
  return (
    <>
      <div className="word">{card.word}</div>
      <div className="src">
        {card.source_url ? (
          <a href={card.source_url} target="_blank" rel="noreferrer">
            {card.source_title || card.source_url}
          </a>
        ) : null}
      </div>

      {!revealed ? (
        <div className="controls">
          <button className="g g3 reveal" onClick={onReveal}>
            Reveal (space)
          </button>
        </div>
      ) : (
        <>
          {phon ? (
            <div
              className="phon"
              style={{ color: "var(--muted)", fontSize: 16, textAlign: "center", marginTop: 4, fontFamily: "var(--serif)" }}
            >
              {phon}
            </div>
          ) : null}
          <div className="def">{def}</div>
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
