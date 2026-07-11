"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { score, isMastered, DAY } from "../lib/srs";

export default function Dashboard() {
  const [words, setWords] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/words", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      setWords(data.words || []);
    } catch (e) {
      setError(String(e.message || e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function del(lemma) {
    setWords((ws) => ws.filter((w) => w.lemma !== lemma));
    await fetch("/api/words", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lemma }),
    });
  }

  if (error) {
    return (
      <div className="container">
        <h1 className="page-title">Your library</h1>
        <div className="notice">Couldn&apos;t reach the backend: {error}</div>
      </div>
    );
  }
  if (!words) return <div className="container">Loading…</div>;

  const now = Date.now();
  const active = words.filter((w) => w.status === "active" || !w.status);
  const dueNow = active.filter((w) => new Date(w.due).getTime() <= now);
  const newCount = active.filter((w) => (w.reps || 0) === 0).length;
  const mastered = words.filter(isMastered).length;
  const learning = active.length - newCount - active.filter(isMastered).length;

  // upcoming 7-day schedule (today bucket includes overdue)
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const t0 = startToday.getTime();
  const labels = ["Today", "+1", "+2", "+3", "+4", "+5", "+6"];
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const w of active) {
    let idx = Math.floor((new Date(w.due).getTime() - t0) / DAY);
    if (idx < 0) idx = 0;
    if (idx <= 6) buckets[idx]++;
  }
  const maxBar = Math.max(1, ...buckets);

  const sorted = [...words].sort((a, b) => new Date(a.due) - new Date(b.due));

  return (
    <div className="container">
      <div className="medium-grid">
        <div className="main-col">
          <h1 className="page-title">Your library</h1>
          <p className="page-sub">
            {words.length} words captured while reading — scheduled on your forgetting curve.
            {dueNow.length > 0 && (
              <>
                {" "}
                <Link href="/tutor" style={{ color: "var(--green)", fontWeight: 500 }}>
                  {dueNow.length} due — talk them through with Mia →
                </Link>
              </>
            )}
          </p>

          <ul className="wlist">
            {sorted.map((w) => {
              const due = new Date(w.due).getTime();
              const tag =
                (w.reps || 0) === 0
                  ? ["new", "new"]
                  : due <= now
                    ? ["due", "due"]
                    : isMastered(w)
                      ? ["ok", "solid"]
                      : ["", ""];
              return (
                <li className="wrow" key={w.lemma}>
                  {tag[1] && <span className={`tag ${tag[0]}`}>{tag[1]}</span>}
                  <span className="w">{w.word}</span>
                  <span className="c">{w.context || ""}</span>
                  <span className="meta">{relDue(due, now)}</span>
                  <button className="x" title="Remove" onClick={() => del(w.lemma)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="side-col">
          <h3>At a glance</h3>
          <div className="grid">
            <Stat n={dueNow.length} l="Due today" />
            <Stat n={newCount} l="New" />
            <Stat n={learning < 0 ? 0 : learning} l="Learning" />
            <Stat n={mastered} l="Mastered" />
          </div>

          <div className="card">
            <h2>Next 7 days</h2>
            <div className="bars">
              {buckets.map((c, i) => (
                <div className="bar" key={i}>
                  <div className="cnt">{c || ""}</div>
                  <div className="fill" style={{ height: `${(c / maxBar) * 100}%` }} />
                  <div className="day">{labels[i]}</div>
                </div>
              ))}
            </div>
          </div>

          <Link className="btn green" href="/tutor">
            Talk to Mia{dueNow.length ? ` · ${dueNow.length} due` : ""}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function relDue(due, now) {
  const d = Math.round((due - now) / DAY);
  if (due <= now) return "now";
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}
