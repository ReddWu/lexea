"use client";

// /memory — "What Mia remembers": the learner's long-term memory, live from
// EverOS. Profile traits on the right, episodic session narratives as a feed.

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Memory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/memory", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <div className="container">
        <div className="notice">Memory unavailable: {error}</div>
      </div>
    );
  if (!data) return <div className="container">Loading…</div>;
  if (!data.configured)
    return (
      <div className="container">
        <div className="notice">EverOS memory is not configured on this deployment.</div>
      </div>
    );

  const traits = [];
  for (const p of data.profiles) {
    for (const t of p.profile_data?.explicit_info || []) traits.push({ t, kind: "explicit" });
    for (const t of p.profile_data?.implicit_traits || []) traits.push({ t, kind: "implicit" });
  }

  return (
    <div className="container">
      <div className="medium-grid">
        <div className="main-col">
          <h1 className="page-title">What Mia remembers</h1>
          <p className="page-sub">
            Long-term memory, live from{" "}
            <a href="https://evermind.ai" target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>
              EverOS
            </a>
            . Every session is distilled into episodes and profile traits — this is why{" "}
            <Link href="/tutor" style={{ color: "var(--green)" }}>
              session five
            </Link>{" "}
            starts smarter than session one.
          </p>

          <h2 style={{ font: "600 16px/1.3 var(--sans)", margin: "0 0 4px" }}>Episodes</h2>
          {data.episodes.length === 0 && (
            <p style={{ color: "var(--muted)" }}>
              No episodes yet — finish a session with Mia and check back in a minute.
            </p>
          )}
          <ul className="wlist">
            {data.episodes.map((e, i) => (
              <li key={e.id || i} style={{ padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ font: "700 16px/1.4 var(--serif)", marginBottom: 4 }}>
                  {e.subject || "Session"}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
                  {e.episode || e.summary}
                </div>
                <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 6 }}>
                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="side-col">
          <h3>Learner profile</h3>
          {traits.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nothing distilled yet.</p>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {traits.map((x, i) => (
              <li key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
                <span
                  className="tag"
                  style={{ marginRight: 8 }}
                  title={x.kind === "explicit" ? "stated by the learner" : "inferred by memory"}
                >
                  {x.kind}
                </span>
                {x.t}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
