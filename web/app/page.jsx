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
        <h1>单词复习</h1>
        <div className="notice">
          读取云端失败:{error}
          <br />
          请确认 Vercel/本地的环境变量 <code>INSFORGE_OSS_HOST</code> 和 <code>INSFORGE_ANON_KEY</code> 已设置,且云端有词。
        </div>
      </div>
    );
  }
  if (!words) return <div className="container">加载中…</div>;

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
  const labels = ["今天", "+1", "+2", "+3", "+4", "+5", "+6"];
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
      <div className="header">
        <div>
          <h1>📚 单词复习</h1>
          <div className="sub">间隔重复(SM-2 / 艾宾浩斯遗忘曲线)· 共 {words.length} 词</div>
        </div>
        <Link className="btn green" href="/review">
          ▶ 开始复习{dueNow.length ? ` (${dueNow.length})` : ""}
        </Link>
      </div>

      <div className="grid">
        <Stat n={dueNow.length} l="今天到期" />
        <Stat n={newCount} l="新词" />
        <Stat n={learning < 0 ? 0 : learning} l="复习中" />
        <Stat n={mastered} l="已掌握" />
        <Stat n={words.length} l="总计" />
      </div>

      <div className="card">
        <h2>未来 7 天复习日程(遗忘曲线安排)</h2>
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

      <div className="card">
        <h2>全部单词({words.length})</h2>
        <ul className="wlist">
          {sorted.map((w) => {
            const due = new Date(w.due).getTime();
            const tag =
              (w.reps || 0) === 0 ? ["new", "新"] : due <= now ? ["due", "到期"] : isMastered(w) ? ["ok", "稳"] : ["", ""];
            return (
              <li className="wrow" key={w.lemma}>
                {tag[1] && <span className={`tag ${tag[0]}`}>{tag[1]}</span>}
                <span className="w">{w.word}</span>
                <span className="c">{w.context || ""}</span>
                <span className="meta">{relDue(due, now)}</span>
                <button className="x" title="删除" onClick={() => del(w.lemma)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
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
  if (due <= now) return "现在";
  if (d <= 0) return "今天";
  if (d === 1) return "明天";
  return `${d} 天后`;
}
