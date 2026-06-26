// weak-words edge function — returns the user's weakest vocabulary, ranked,
// for a ChatGPT Custom GPT Action to fetch live.
// GET {oss_host}/functions/weak-words?n=30
// Auth: header `x-api-key: <WEAK_WORDS_TOKEN>` (or `Authorization: Bearer ...`).
import { createClient } from "npm:@insforge/sdk";

export default async function (req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const token = Deno.env.get("WEAK_WORDS_TOKEN");
  const provided =
    req.headers.get("x-api-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || provided !== token) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const url = new URL(req.url);
  const n = Math.min(parseInt(url.searchParams.get("n") || "30", 10) || 30, 100);

  const client = createClient({
    baseUrl: Deno.env.get("INSFORGE_BASE_URL"),
    anonKey: Deno.env.get("ANON_KEY"),
  });

  const { data, error } = await client.database.from("words").select("*").eq("status", "active").limit(1000);
  if (error) return json({ error: String((error as any).message || error) }, 500, cors);

  const now = Date.now();
  const score = (w: any) => {
    let s = 0;
    if (new Date(w.due).getTime() <= now) s += 2; // overdue
    if (w.state === "relearning") s += 3;
    s += (w.lapses || 0) * 2;
    if ((w.reps || 0) === 0) s += 1; // never reviewed
    s -= (w.reps || 0) * 0.2;
    s -= Math.max(0, (w.ease || 2.5) - 2.5);
    s -= (w.times_used_in_chat || 0) * 0.3;
    return s;
  };

  const words = (data || [])
    .map((w: any) => ({ w, s: score(w) }))
    .sort((a: any, b: any) => b.s - a.s)
    .slice(0, n)
    .map((x: any) => ({
      word: x.w.word,
      context: x.w.context,
      lapses: x.w.lapses,
      reps: x.w.reps,
      due: x.w.due,
      state: x.w.state,
    }));

  return json({ count: words.length, words }, 200, cors);
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
