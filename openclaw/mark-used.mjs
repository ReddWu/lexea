#!/usr/bin/env node
// mark-used.mjs — after openclaw uses target words in a reply, bump their
// times_used_in_chat so they sink in the weakness ranking over time.
//
//   INSFORGE_URL=... INSFORGE_ANON_KEY=... node mark-used.mjs serendipity ubiquitous

const URL = (process.env.INSFORGE_URL || "").replace(/\/+$/, "");
const KEY = process.env.INSFORGE_ANON_KEY || "";
const words = process.argv.slice(2);

if (!URL || !KEY) {
  console.error("Set INSFORGE_URL and INSFORGE_ANON_KEY env vars.");
  process.exit(1);
}
if (!words.length) {
  console.error("usage: mark-used.mjs <word> [word ...]");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

for (const raw of words) {
  const lemma = raw.trim().toLowerCase();
  const g = await fetch(
    `${URL}/api/database/records/words?lemma=eq.${encodeURIComponent(lemma)}&select=times_used_in_chat`,
    { headers }
  );
  const rows = await g.json().catch(() => []);
  if (!rows.length) {
    console.error("skip (not in vocab):", lemma);
    continue;
  }
  const n = (rows[0].times_used_in_chat || 0) + 1;
  await fetch(`${URL}/api/database/records/words?lemma=eq.${encodeURIComponent(lemma)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ times_used_in_chat: n }),
  });
  console.log(`${lemma}: times_used_in_chat=${n}`);
}
