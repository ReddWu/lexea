export const runtime = "edge";

// POST /api/sync — upsert a full word record from the browser extension.
// The extension is the local-first source of truth; this mirrors its records
// into Butterbase so the tutor/dashboard see them. CORS open (extension calls
// from arbitrary pages via its service worker).
import { getWordByLemma, patchWord, insertWord, configured } from "../../../lib/butterbase";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  if (!configured()) return json({ error: "backend not configured" }, 500);
  let rec;
  try {
    rec = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const lemma = (rec.lemma || rec.word || "").trim().toLowerCase();
  if (!lemma) return json({ error: "lemma required" }, 400);

  // never trust/forward local-only or DB-owned fields
  const { id, times_used_in_chat, ...body } = rec;
  body.lemma = lemma;

  try {
    const existing = await getWordByLemma(lemma);
    if (existing) {
      await patchWord(lemma, body);
      return json({ ok: true, updated: true }, 200);
    }
    await insertWord(body);
    return json({ ok: true, inserted: true }, 200);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
