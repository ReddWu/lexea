// Server-only EverOS Cloud client (memory layer for the Mia tutor).
// Pure fetch — runs on the edge. All calls are best-effort: memory should
// never break a tutoring turn. Docs: https://docs.evermind.ai/llms-full.txt
const BASE = (process.env.EVEROS_URL || "https://api.evermind.ai").replace(/\/+$/, "");
const KEY = process.env.EVEROS_API_KEY || "";
const USER = process.env.EVEROS_USER_ID || "redd";

export function everosConfigured() {
  return Boolean(KEY);
}

async function call(path, body, method = "POST") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`everos ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data;
}

// Record one exchange (fire-and-forget from the caller's perspective).
export async function remember(sessionId, messages) {
  const t = Date.now();
  return call("/api/v1/memories", {
    user_id: USER,
    session_id: sessionId,
    messages: messages.map((m, i) => ({
      role: m.role,
      timestamp: t + i,
      content: String(m.content || "").slice(0, 4000),
    })),
  });
}

// Force extraction at session end so the next session sees fresh memories.
export async function flush(sessionId) {
  return call("/api/v1/memories/flush", { user_id: USER, session_id: sessionId });
}

// Recall for session start: learner profile traits + recent episodes.
export async function recall(query, topK = 5) {
  return call("/api/v1/memories/search", {
    query,
    filters: { user_id: USER },
    memory_types: ["episodic_memory", "profile"],
    method: "hybrid",
    top_k: topK,
  });
}

// Full structured view for the "What Mia remembers" panel.
export async function listMemories(memoryType, pageSize = 20) {
  return call("/api/v1/memories/get", {
    memory_type: memoryType,
    filters: { user_id: USER },
    page: 1,
    page_size: pageSize,
    rank_order: "desc",
  });
}

// Render recall results into a compact prompt block ("" if nothing).
export function memoryBlock(data) {
  if (!data) return "";
  const lines = [];
  for (const p of data.profiles || []) {
    const info = [...(p.profile_data?.explicit_info || []), ...(p.profile_data?.implicit_traits || [])];
    for (const i of info.slice(0, 12)) lines.push(`- ${i}`);
  }
  for (const e of (data.episodes || []).slice(0, 4)) {
    lines.push(`- (${new Date(e.timestamp).toISOString().slice(0, 10)}) ${e.summary || e.episode}`.slice(0, 240));
  }
  return lines.join("\n");
}
