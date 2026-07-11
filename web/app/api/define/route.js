export const runtime = "edge";

// POST /api/define — one LLM call returning a learner-friendly definition.
// Body: { word, context? }  →  { plain, zh }
//   plain: simple-English explanation (as used in the given sentence)
//   zh:    concise Chinese translation of that sense
// Runs on the same OpenAI-compatible LLM as the tutor (Butterbase AI gateway
// by default; see web/lib/llm.js). CORS is open so the browser extension can
// call this from any page.
import { llmConfigured } from "../../../lib/llm";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BASE = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "anthropic/claude-haiku-4.5";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  if (!llmConfigured()) return json({ error: "LLM not configured" }, 500);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const word = (body.word || "").trim();
  if (!/^[a-zA-Z][a-zA-Z'’ -]{0,60}$/.test(word)) {
    return json({ error: "bad word" }, 400);
  }
  const context = (body.context || "").slice(0, 600);

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 250,
        messages: [
          {
            role: "system",
            content:
              'You help an English learner (Chinese native speaker) understand a word they just saved while reading. Reply with ONLY a JSON object, no markdown: {"plain": "explain the word in very simple English (CEFR A2), 1-2 short sentences, matching the sense used in the sentence", "zh": "concise Chinese gloss of this sense, a few characters"}',
          },
          {
            role: "user",
            content: context
              ? `Word: "${word}"\nSentence it appeared in: "${context}"`
              : `Word: "${word}"`,
          },
        ],
      }),
    });
    if (!res.ok) return json({ error: `llm ${res.status}: ${await res.text()}` }, 502);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const m = text.match(/\{[\s\S]*\}/); // tolerate stray prose/fences around the JSON
    const out = m ? JSON.parse(m[0]) : {};
    return json({ plain: out.plain || null, zh: out.zh || null }, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 502);
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
