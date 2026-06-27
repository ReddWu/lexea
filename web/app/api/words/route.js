import { NextResponse } from "next/server";
import { listWords, patchWord, removeWord, configured } from "../../../lib/cloud";

export const dynamic = "force-dynamic";

function guard() {
  if (!configured()) {
    return NextResponse.json(
      { error: "Server not configured: set INSFORGE_OSS_HOST and INSFORGE_ANON_KEY." },
      { status: 500 }
    );
  }
  return null;
}

export async function GET() {
  const g = guard();
  if (g) return g;
  try {
    return NextResponse.json({ words: await listWords() });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}

export async function PATCH(req) {
  const g = guard();
  if (g) return g;
  try {
    const { lemma, patch } = await req.json();
    if (!lemma || !patch) return NextResponse.json({ error: "lemma and patch required" }, { status: 400 });
    const rows = await patchWord(lemma, patch);
    return NextResponse.json({ ok: true, row: Array.isArray(rows) ? rows[0] : rows });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}

export async function DELETE(req) {
  const g = guard();
  if (g) return g;
  try {
    const { lemma } = await req.json();
    if (!lemma) return NextResponse.json({ error: "lemma required" }, { status: 400 });
    await removeWord(lemma);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
