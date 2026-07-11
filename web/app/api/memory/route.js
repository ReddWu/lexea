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
    const errs = [];
    const [prof, epi] = await Promise.all([
      listMemories("profile").catch((e) => (errs.push("profile: " + String(e?.message || e)), null)),
      listMemories("episodic_memory").catch((e) => (errs.push("episodes: " + String(e?.message || e)), null)),
    ]);
    if (errs.length) console.error("[memory]", errs.join(" | "));
    return NextResponse.json({
      configured: true,
      profiles: prof?.profiles || [],
      episodes: epi?.episodes || [],
      ...(errs.length ? { debug: errs } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
