// Server-only LLM access for the tutor agent.
// Speaks the OpenAI-compatible /chat/completions shape so it works against the
// Butterbase AI gateway (default) or any other compatible endpoint via env:
//   LLM_BASE_URL, LLM_API_KEY, LLM_TUTOR_MODEL
// MOCK_TUTOR=1 swaps in a scripted model that exercises the tool path — lets
// the whole UI + SRS write path be tested with zero credits.

const BASE = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_TUTOR_MODEL || process.env.LLM_MODEL || "anthropic/claude-haiku-4.5";

export function llmConfigured() {
  return process.env.MOCK_TUTOR === "1" || Boolean(BASE && KEY);
}

// Streaming variant: calls onDelta(textFragment) as content arrives and
// returns the complete assistant message {role, content, tool_calls?}.
// Tool-call fragments are accumulated by index (OpenAI streaming shape).
export async function chatStream(messages, tools, onDelta) {
  if (process.env.MOCK_TUTOR === "1") {
    const msg = mockChat(messages);
    if (msg.content && onDelta) onDelta(msg.content);
    return msg;
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      stream: true,
      messages,
      ...(tools && tools.length ? { tools } : {}),
    }),
  });
  if (!res.ok) throw new Error(`llm failed: ${res.status} ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const toolCalls = []; // accumulated by index
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop(); // keep the partial line
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      let d;
      try {
        d = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = d.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        if (onDelta) onDelta(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? 0;
        if (!toolCalls[i]) toolCalls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
        if (tc.id) toolCalls[i].id = tc.id;
        if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
        if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  const msg = { role: "assistant", content: content || null };
  const calls = toolCalls.filter(Boolean);
  if (calls.length) msg.tool_calls = calls;
  return msg;
}

// messages: OpenAI-shape [{role, content, tool_calls?, tool_call_id?}]
// tools: OpenAI-shape [{type:"function", function:{name, description, parameters}}]
// returns the assistant message object {role, content, tool_calls?}
export async function chat(messages, tools) {
  if (process.env.MOCK_TUTOR === "1") return mockChat(messages);
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      messages,
      ...(tools && tools.length ? { tools } : {}),
    }),
  });
  if (!res.ok) throw new Error(`llm failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("llm returned no message");
  return msg;
}

// --- scripted mock ---------------------------------------------------------
// Turn 1: greets + plans (after the injected get_weak_words result).
// When the user says something containing "quiz": asks a question.
// When the user answers anything else after a quiz: calls review_word(rating 3)
// then wraps up. Enough to demo the full loop offline.
function mockChat(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content || "").toLowerCase();
  const askedQuiz = messages.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && m.content.includes("[mock quiz]")
  );
  const alreadyReviewed = messages.some(
    (m) => m.role === "tool" && String(m.content || "").includes('"ok":true')
  );

  if (askedQuiz && !alreadyReviewed && lastUser) {
    // grade the answer: call review_word on "agnostic"
    return {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "mock_call_1",
          type: "function",
          function: { name: "review_word", arguments: JSON.stringify({ word: "agnostic", rating: 3 }) },
        },
      ],
    };
  }
  if (alreadyReviewed) {
    return {
      role: "assistant",
      content:
        "Nice — that's exactly it. I've pushed *agnostic* further out on your schedule. Want another one, or shall we just chat?",
    };
  }
  if (text.includes("quiz") || text.includes("背单词")) {
    return {
      role: "assistant",
      content:
        '[mock quiz] Quick one: your note had "the infrastructure has to be vendor-agnostic." What does *agnostic* mean in that sentence?',
    };
  }
  return {
    role: "assistant",
    content:
      "Hey! I checked your list — 12 words are due and you've lapsed on *script* and *piping* before, so I'll lean on those today. What do you want to talk about — or say “quiz me” and we'll drill a few?",
  };
}
