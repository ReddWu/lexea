// review-word edge function — the ChatGPT Custom GPT calls this after quizzing
// the user on a word, to record how well they recalled it. Applies SM-2 and
// writes the new schedule back, so forgotten words resurface more often — the
// same `words` table the extension and review website read.
// POST {oss_host}/functions/review-word
// Body: { "word": "...", "rating": 1|2|3|4 }  (1 again, 2 hard, 3 good, 4 easy)
// Auth: header `x-api-key: <WEAK_WORDS_TOKEN>` (or `Authorization: Bearer ...`).
import { createClient } from "npm:@insforge/sdk";

const DAY = 86400000;

// SM-2 — mirrors web/lib/srs.js and extension/review.js.
function schedule(rec: any, rating: number) {
  const now = Date.now();
  let ease = rec.ease || 2.5;
  let interval = rec.interval_days || 0;
  let reps = rec.reps || 0;
  let lapses = rec.lapses || 0;
  let state: string, dueMs: number;
  const isNew = (rec.state || "new") === "new" || reps === 0;

  if (rating === 1) {
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    state = "relearning";
    dueMs = now + 10 * 60 * 1000;
  } else {
    if (isNew) {
      interval = rating === 4 ? 4 : 1;
      if (rating === 2) ease = Math.max(1.3, ease - 0.15);
      if (rating === 4) ease = ease + 0.15;
    } else if (rating === 2) {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round(interval * 1.2));
    } else if (rating === 3) {
      interval = Math.max(1, Math.round(interval * ease));
    } else {
      ease = ease + 0.15;
      interval = Math.max(1, Math.round(interval * ease * 1.3));
    }
    reps += 1;
    state = "review";
    dueMs = now + interval * DAY;
  }

  return {
    ease,
    interval_days: interval,
    reps,
    lapses,
    state,
    due: new Date(dueMs).toISOString(),
    last_review: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
}

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

  const lemma = String(body.word || "").trim().toLowerCase();
  const rating = Number(body.rating);
  if (!lemma) return json({ error: "word required" }, 400, cors);
  if (![1, 2, 3, 4].includes(rating)) return json({ error: "rating must be 1, 2, 3, or 4" }, 400, cors);

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const { data: rows, error: selErr } = await client.database
    .from("words")
    .select("*")
    .eq("lemma", lemma)
    .limit(1);
  if (selErr) return json({ error: String((selErr as any).message || selErr) }, 500, cors);
  if (!rows || !rows.length) return json({ error: "word not in vocabulary", word: lemma }, 404, cors);

  const patch = schedule(rows[0], rating);
  const { error: updErr } = await client.database.from("words").update(patch).eq("lemma", lemma);
  if (updErr) return json({ error: String((updErr as any).message || updErr) }, 500, cors);

  return json({ ok: true, word: lemma, due: patch.due, interval_days: patch.interval_days, state: patch.state }, 200, cors);
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
