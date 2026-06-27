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
  const [def, setDef] = useState("查词中…");
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
    if (current.translation) {
      setDef(current.translation);
      return;
    }
    setDef("查词中…");
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(current.lemma));
      if (!r.ok) return setDef("(无在线释义,看例句记忆)");
      const data = await r.json();
      const out = [];
      for (const entry of data) {
        for (const m of entry.meanings || []) {
          const d = m.definitions && m.definitions[0];
          if (d?.definition) out.push((m.partOfSpeech ? `(${m.partOfSpeech}) ` : "") + d.definition);
          if (out.length >= 3) break;
        }
        if (out.length >= 3) break;
      }
      setDef(out.length ? out.join("\n") : "(无在线释义,看例句记忆)");
    } catch {
      setDef("(无在线释义,看例句记忆)");
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
      setDef("查词中…");
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
        <Link href="/">← 看板</Link>
        <span className="sub">{queue ? `本次 ${done}/${total} · 待复习 ${queue.length}` : ""}</span>
      </div>
      <div className="review-main">
        <div className="flash">
          {error ? (
            <div className="done">读取失败:{error}</div>
          ) : !queue ? (
            "加载中…"
          ) : !current ? (
            total === 0 ? (
              <div className="done">
                <div className="big">✅</div>
                <p>现在没有到期需要复习的词。</p>
                <p className="sub">去网页上多选些词,或等已存的词到期。</p>
              </div>
            ) : (
              <div className="done">
                <div className="big">🎉</div>
                <p>本次复习完成!共复习 <b>{done}</b> 个词。</p>
                <Link className="btn blue" href="/">回看板</Link>
              </div>
            )
          ) : (
            <Card card={current} revealed={revealed} def={def} onReveal={reveal} onGrade={grade} />
          )}
        </div>
      </div>
      {current && <div className="hintbar">快捷键:空格 = 显示答案 · 1 忘了 / 2 难 / 3 会 / 4 简单</div>}
    </div>
  );
}

function Card({ card, revealed, def, onReveal, onGrade }) {
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
            显示答案 (空格)
          </button>
        </div>
      ) : (
        <>
          <div className="def">{def}</div>
          <div className="ctx-label">例句 / CONTEXT</div>
          {contexts.length ? (
            contexts.map((c, i) => (
              <div className="ctx" key={i}>
                {highlight(c.sentence, card.word)}
                {c.title || c.url ? <span className="from">— {c.title || c.url}</span> : null}
              </div>
            ))
          ) : (
            <div className="ctx" style={{ color: "#9ca3af" }}>
              (没有保存例句)
            </div>
          )}
          <div className="controls">
            <button className="g g1" onClick={() => onGrade(1)}>
              忘了<small>&lt;10分钟</small>
            </button>
            <button className="g g2" onClick={() => onGrade(2)}>
              难<small>1 天</small>
            </button>
            <button className="g g3" onClick={() => onGrade(3)}>
              会
            </button>
            <button className="g g4" onClick={() => onGrade(4)}>
              简单
            </button>
          </div>
        </>
      )}
    </>
  );
}

function highlight(sentence, word) {
  const re = new RegExp("(" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
  const parts = String(sentence).split(re);
  const wl = word.toLowerCase();
  return parts.map((p, i) => (p.toLowerCase() === wl ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}
