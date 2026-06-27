// Server-only InsForge cloud access (imported only by /api route handlers).
// The anon key lives in process.env and is never sent to the browser — pages
// talk to /api/* which call these helpers.

const HOST = (process.env.INSFORGE_OSS_HOST || "").replace(/\/+$/, "");
const KEY = process.env.INSFORGE_ANON_KEY || "";

function headers(extra) {
  return { Authorization: `Bearer ${KEY}`, ...extra };
}

export function configured() {
  return Boolean(HOST && KEY);
}

export async function listWords() {
  const res = await fetch(`${HOST}/api/database/records/words?order=due.asc&limit=2000`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cloud list failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function patchWord(lemma, patch) {
  const res = await fetch(`${HOST}/api/database/records/words?lemma=eq.${encodeURIComponent(lemma)}`, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`cloud patch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function removeWord(lemma) {
  const res = await fetch(`${HOST}/api/database/records/words?lemma=eq.${encodeURIComponent(lemma)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`cloud delete failed: ${res.status} ${await res.text()}`);
  return true;
}
