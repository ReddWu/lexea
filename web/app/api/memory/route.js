export const runtime = "edge";

// GET /api/memory — structured view of Mia's long-term memory (EverOS Cloud):
// learner profile traits + episodic session summaries. Read-only.
import { NextResponse } from "next/server";
import { everosConfigured, listMemories } from "../../../lib/everos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!everosConfigured()) {
    return NextResponse.json({ configured: false, profiles: [], episodes: [] });
  }
  try {
    const [prof, epi] = await Promise.all([
      listMemories("profile").catch(() => null),
      listMemories("episodic_memory").catch(() => null),
    ]);
    return NextResponse.json({
      configured: true,
      profiles: prof?.profiles || [],
      episodes: epi?.episodes || [],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
