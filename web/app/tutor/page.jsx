"use client";

// /tutor — chat with Mia + live word-state side panel.
// The panel refetches after every reply; rows whose SRS state just changed
// flash so the audience can SEE the invisible assessment happen.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { score } from "../../lib/srs";

const OPENER = "__start_session__";

export default function Tutor() {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState([]);
  const [changed, setChanged] = useState({}); // lemma -> "up" | "down"
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const wordsRef = useRef([]);
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current && typeof crypto !== "undefined") {
    sessionIdRef.current = "mia-" + crypto.randomUUID().slice(0, 13);
  }

  async function loadWords(markDiff) {
    try {
      const res = await fetch("/api/words", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      const next = data.words || [];
      if (markDiff) {
        const prev = Object.fromEntries(wordsRef.current.map((w) => [w.lemma, w]));
        const marks = {};
        for (const w of next) {
          const p = prev[w.lemma];
          if (!p) marks[w.lemma] = "up";
          else if (p.due !== w.due || p.reps !== w.reps || p.lapses !== w.lapses) {
            marks[w.lemma] = (w.lapses || 0) > (p.lapses || 0) ? "down" : "up";
          }
        }
        if (Object.keys(marks).length) {
          setChanged(marks);
          setTimeout(() => setChanged({}), 4000);
        }
      }
      wordsRef.current = next;
      setWords(next);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function send(text, opts = {}) {
    // hidden messages ride in the history (the model needs them) but never render
    const history = [...messages, { role: "user", content: text, hidden: !!opts.hidden }];
    setMessages(history);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          end: !!opts.end,
          session_id: sessionIdRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      setMessages((ms) => [...ms, { role: "assistant", content: data.reply }]);
      await loadWords(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadWords(false).then(() => {
      // kick off the session: Mia plans it based on the forgetting curve
      send("Hi Mia, let's start today's session.", { hidden: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const now = Date.now();
  const ranked = words
    .filter((w) => w.status === "active")
    .map((w) => ({ ...w, _s: score(w, now) }))
    .sort((a, b) => b._s - a._s)
    .slice(0, 18);
  const maxS = Math.max(1, ...ranked.map((w) => w._s));
  const dueCount = words.filter((w) => w.status === "active" && new Date(w.due).getTime() <= now).length;

  function onSubmit(e) {
    e.preventDefault();
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    send(t);
  }

  return (
    <div className="tutor-wrap">
      <div className="chat panel-box">
        <div className="chat-head">
          <div>
            <b>Mia</b> <span className="sub">your vocabulary mentor · {dueCount} words due</span>
          </div>
          <div className="head-actions">
            <button
              className="end-btn"
              disabled={busy || messages.length < 2}
              onClick={() => send("I need to go — let's wrap up for today.", { end: true })}
            >
              End session
            </button>
            <Link href="/">← library</Link>
          </div>
        </div>
        <div className="chat-scroll" ref={scrollRef}>
          {messages
            .filter((m) => !m.hidden)
            .map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))}
          {busy && <div className="msg assistant typing">…</div>}
          {error && <div className="msg err">{error}</div>}
        </div>
        <form className="chat-input" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Chat in English — or try "quiz me"'
            disabled={busy}
            autoFocus
          />
          <button className="btn blue" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>

      <div className="panel panel-box">
        <h2>
          Your words <span className="sub">weakest first — watch them move</span>
        </h2>
        {ranked.map((w) => (
          <div key={w.lemma} className={`wrow ${changed[w.lemma] || ""}`}>
            <div className="wtop">
              <span className="wword">{w.word}</span>
              <span className="wmeta">
                {w.lapses > 0 ? "forgot " + w.lapses + "× · " : ""}
                {w.reps}r · {new Date(w.due).getTime() <= now ? "due now" : rel(w.due, now)}
              </span>
            </div>
            <div className="wbar">
              <div
                className="wfill"
                style={{ width: `${Math.max(6, 100 - (Math.max(0, w._s) / maxS) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .panel-box {
          background: #fff;
          border: 1px solid var(--line-strong);
          border-radius: 6px;
          padding: 18px;
        }
        .chat-head b {
          font: 700 20px/1 var(--serif);
        }
        .tutor-wrap {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
          max-width: 1060px;
          margin: 0 auto;
          padding: 12px 16px;
          height: calc(100vh - 57px - 24px);
        }
        .chat {
          display: flex;
          flex-direction: column;
          margin-bottom: 0;
          overflow: hidden;
        }
        .chat-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--line);
        }
        .sub {
          color: var(--muted);
          font-size: 12px;
          font-weight: 400;
        }
        .head-actions {
          display: flex;
          gap: 12px;
          align-items: baseline;
        }
        .end-btn {
          font: 600 12px/1 -apple-system, system-ui, sans-serif;
          color: var(--muted);
          background: #eef0f3;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 6px 10px;
          cursor: pointer;
        }
        .end-btn:hover {
          color: var(--ink);
        }
        .end-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .chat-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 14px 2px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .msg {
          max-width: 82%;
          padding: 10px 13px;
          border-radius: 14px;
          white-space: pre-wrap;
        }
        .msg.user {
          align-self: flex-end;
          background: var(--black);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .msg.assistant {
          align-self: flex-start;
          background: #f7f7f5;
          border-bottom-left-radius: 4px;
        }
        .msg.err {
          align-self: center;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
        }
        .typing {
          color: var(--muted);
        }
        .chat-input {
          display: flex;
          gap: 8px;
          padding-top: 10px;
          border-top: 1px solid var(--line);
        }
        .chat-input input {
          flex: 1;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
          font: inherit;
        }
        .panel {
          overflow-y: auto;
          margin-bottom: 0;
        }
        .wrow {
          padding: 7px 6px;
          border-radius: 8px;
          transition: background 0.4s;
        }
        .wrow.up {
          background: #ecfdf5;
          animation: flash 0.6s ease 3;
        }
        .wrow.down {
          background: #fef2f2;
          animation: flash 0.6s ease 3;
        }
        @keyframes flash {
          50% {
            filter: brightness(0.92);
          }
        }
        .wtop {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .wword {
          font: 700 14px/1.3 var(--serif);
        }
        .wmeta {
          color: var(--muted);
          font-size: 11px;
        }
        .wbar {
          height: 5px;
          background: #eef0f3;
          border-radius: 3px;
          margin-top: 4px;
        }
        .wfill {
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, #d9a514, var(--green));
          transition: width 0.8s ease;
        }
        @media (max-width: 860px) {
          .panel-box {
          background: #fff;
          border: 1px solid var(--line-strong);
          border-radius: 6px;
          padding: 18px;
        }
        .chat-head b {
          font: 700 20px/1 var(--serif);
        }
        .tutor-wrap {
            grid-template-columns: 1fr;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}

function rel(due, now) {
  const d = Math.round((new Date(due).getTime() - now) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
}
