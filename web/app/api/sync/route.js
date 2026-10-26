export const runtime = "edge";

// POST /api/sync — upsert a full word record from the browser extension.
// The extension is the local-first source of truth; this mirrors its records
// into Supabase so the tutor/dashboard see them. Requires the user's JWT
// (Authorization: Bearer) — RLS scopes every row to that user.
import { getWordByLemma, patchWord, insertWord, configured, getToken } from "../../../lib/cloud";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const LANGS = new Set(["en", "zh", "es", "fr", "ja"]);

function canonicalLemma(value, lang) {
  let lemma = String(value || "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase(lang === "es" ? "es" : undefined);
  if (lang === "es") {
    lemma = lemma
      .replace(/^[¿¡"'“”«»()[\]{}.,;:!?…\-–—\s]+/u, "")
      .replace(/[¿¡"'“”«»()[\]{}.,;:!?…\-–—\s]+$/u, "");
  }
  return lemma;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  if (!configured()) return json({ error: "backend not configured" }, 500);
  const token = await getToken(req);
  if (!token) return json({ error: "unauthorized" }, 401);

  let rec;
  try {
    rec = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const lang = LANGS.has(rec.lang) ? rec.lang : "en";
  const lemma = canonicalLemma(rec.lemma || rec.word, lang);
  if (!lemma) return json({ error: "lemma required" }, 400);

  // never trust/forward local-only or DB-owned fields
  const { id, times_used_in_chat, stability, difficulty, user_id, ...body } = rec;
  body.lemma = lemma;
  body.lang = lang;

  try {
    const existing = await getWordByLemma(token, lemma, lang);
    if (existing) {
      await patchWord(token, lemma, body, lang);
      return json({ ok: true, updated: true }, 200);
    }
    await insertWord(token, body);
    return json({ ok: true, inserted: true }, 200);
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status === 401 ? 401 : 502);
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
