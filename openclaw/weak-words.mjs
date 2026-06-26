#!/usr/bin/env node
// weak-words.mjs — pull the user's weakest vocabulary from the InsForge cloud
// mirror and print a ready-to-inject system-prompt block (or JSON).
//
//   INSFORGE_URL=https://xxxx.us-east.insforge.app \
//   INSFORGE_ANON_KEY=anon_... \
//   node weak-words.mjs [N] [--json]
//
// Requires cloud sync to be ON in the extension (so words reach InsForge).

const URL = (process.env.INSFORGE_URL || "").replace(/\/+$/, "");
const KEY = process.env.INSFORGE_ANON_KEY || "";
const N = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || "30", 10);
const asJson = process.argv.includes("--json");

if (!URL || !KEY) {
  console.error("Set INSFORGE_URL and INSFORGE_ANON_KEY env vars.");
  process.exit(1);
}

const res = await fetch(`${URL}/api/database/records/words?status=eq.active&limit=1000`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error("Fetch failed:", res.status, await res.text());
  process.exit(1);
}
const words = await res.json();
const now = Date.now();

// weakness score: overdue / relearning / lapsed / brand-new rank higher;
// well-known, easy, frequently-used-in-chat sink.
function score(w) {
  let s = 0;
  if (new Date(w.due).getTime() <= now) s += 2; // overdue
  if (w.state === "relearning") s += 3;
  s += (w.lapses || 0) * 2;
  if ((w.reps || 0) === 0) s += 1; // never reviewed
  s -= (w.reps || 0) * 0.2;
  s -= Math.max(0, (w.ease || 2.5) - 2.5);
  s -= (w.times_used_in_chat || 0) * 0.3; // already practised in chat
  return s;
}

const ranked = words
  .map((w) => ({ w, s: score(w) }))
  .sort((a, b) => b.s - a.s)
  .slice(0, N)
  .map((x) => x.w);

if (asJson) {
  console.log(
    JSON.stringify(
      ranked.map((w) => ({ word: w.word, context: w.context, lapses: w.lapses, reps: w.reps, due: w.due })),
      null,
      2
    )
  );
} else {
  const list = ranked.map((w) => `- ${w.word}${w.context ? `  (e.g. "${w.context}")` : ""}`).join("\n");
  console.log(
    `The user is learning these English words and remembers some only weakly. ` +
      `In your replies, naturally and correctly use as many of them as genuinely fit the conversation — ` +
      `prioritize the ones earlier in the list (they are weaker). Do NOT force them, list them, or define them ` +
      `unprompted; weave them into normal, fluent sentences. If the user uses one correctly, you may briefly affirm it.\n\n` +
      `Weak words (weakest first):\n${list}`
  );
}
