export const runtime = "edge";

// POST /api/define — one LLM call returning a learner-friendly definition.
// Body: { word, context?, lang? }  →  { plain, zh, reading }
//   plain:   simple-English explanation (as used in the given sentence)
//   zh:      concise Chinese translation of that sense
//   reading: pronunciation — pinyin (zh), kana+romaji (ja), IPA (es/fr);
//            null for en (the extension has a local IPA dictionary)
// Requires a signed-in user (Bearer token or session cookie) so the LLM
// endpoint can't be farmed anonymously.

import { getToken, validateToken } from "../../../lib/cloud";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const BASE = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "anthropic/claude-haiku-4.5";

// what counts as a saveable "word or short phrase", per learning language
const WORD_RE = {
  en: /^[a-zA-Z][a-zA-Z'’ -]{0,60}$/,
  es: /^(?=.{1,120}$)(?=.*\p{L})[\p{L}\p{M}\s'’.,;:¡!¿?…«»"“”()\-–—]+$/u,
  fr: /^[a-zA-ZÀ-ÿœŒçÇ][a-zA-ZÀ-ÿœŒçÇ'’ -]{0,60}$/u,
  zh: /^[一-鿿㐀-䶿々]{1,8}$/u,
  ja: /^[぀-ゟ゠-ヿ一-鿿㐀-䶿ー々]{1,12}$/u,
};

const READING_SPEC = {
  en: "null",
  zh: 'Hanyu Pinyin with tone marks, e.g. "xuéxí"',
  ja: 'kana reading + romaji, e.g. "べんきょう (benkyō)"',
  es: 'IPA, e.g. "/eɸiˈmeɾo/"',
  fr: 'IPA, e.g. "/efemɛʁ/"',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  if (!BASE || !KEY) return json({ error: "LLM not configured" }, 500);
  const token = getToken(req);
  if (!(await validateToken(token))) return json({ error: "unauthorized" }, 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const lang = WORD_RE[body.lang] ? body.lang : "en";
  const word = (body.word || "").trim();
  if (!WORD_RE[lang].test(word)) {
    return json({ error: "bad word" }, 400);
  }
  const context = (body.context || "").slice(0, 600);
  const langName = { en: "English", zh: "Chinese", es: "Spanish", fr: "French", ja: "Japanese" }[lang];

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              `You help a language learner (Chinese native speaker) understand a ${langName} word or phrase they just saved while reading. Treat punctuation as part of the quoted expression, not as a reason to reject it. For a phrase, explain the meaning of the whole expression in context rather than defining each word separately. Reply with ONLY a JSON object, no markdown: {"plain": "explain the word or phrase in very simple English (CEFR A2), 1-2 short sentences, matching the sense used in the sentence", "zh": ${lang === "zh" ? "null" : '"concise Chinese gloss of this sense"'}, "reading": ${READING_SPEC[lang]}}`,
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
    return json({ plain: out.plain || null, zh: out.zh || null, reading: out.reading || null }, 200);
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
