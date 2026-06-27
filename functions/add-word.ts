// add-word edge function — lets the ChatGPT Custom GPT save a word the user
// asked about into their cloud vocabulary (so it joins future weak-word
// practice). POST {oss_host}/functions/add-word
// Body: { "word": "...", "context"?: "...", "translation"?: "..." }
// Auth: header `x-api-key: <WEAK_WORDS_TOKEN>` (or `Authorization: Bearer ...`).
import { createClient } from "npm:@insforge/sdk";

export default async function (req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const token = Deno.env.get("WEAK_WORDS_TOKEN");
  const provided =
    req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || provided !== token) return json({ error: "unauthorized" }, 401, cors);

  if (req.method !== "POST") return json({ error: "use POST" }, 405, cors);

  let body: any = {};
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "invalid JSON body" }, 400, cors);
  }

  const word = String(body.word || "").trim();
  const lemma = word.toLowerCase();
  if (!lemma || !/^[a-zA-Z][a-zA-Z'’-]{1,39}$/.test(word)) {
    return json({ error: "not a valid single word" }, 400, cors);
  }
  const context = body.context ? String(body.context).trim() : null;
  const translation = body.translation ? String(body.translation).trim() : null;

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const { data: existing, error: selErr } = await client.database
    .from("words")
    .select("lemma")
    .eq("lemma", lemma)
    .limit(1);
  if (selErr) return json({ error: String((selErr as any).message || selErr) }, 500, cors);

  if (existing && existing.length) {
    // already saved — fill in context/translation if newly provided, don't touch SRS
    const patch: Record<string, unknown> = { status: "active" };
    if (context) patch.context = context;
    if (translation) patch.translation = translation;
    await client.database.from("words").update(patch).eq("lemma", lemma);
    return json({ ok: true, added: false, word }, 200, cors);
  }

  const rec = {
    word,
    lemma,
    context,
    translation,
    contexts: context ? [{ sentence: context, at: new Date().toISOString() }] : [],
  };
  const { error: insErr } = await client.database.from("words").insert(rec);
  if (insErr) return json({ error: String((insErr as any).message || insErr) }, 500, cors);

  return json({ ok: true, added: true, word }, 200, cors);
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
