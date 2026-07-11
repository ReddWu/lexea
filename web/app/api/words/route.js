export const runtime = "edge";

import { NextResponse } from "next/server";
import { listWords, patchWord, removeWord, configured } from "../../../lib/butterbase";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function guard() {
  if (!configured()) {
    return NextResponse.json(
      { error: "Server not configured: set BUTTERBASE_APP_URL and BUTTERBASE_KEY." },
      { status: 500, headers: CORS }
    );
  }
  return null;
}

export async function GET() {
  const g = guard();
  if (g) return g;
  try {
    return NextResponse.json({ words: await listWords() }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502, headers: CORS });
  }
}

export async function PATCH(req) {
  const g = guard();
  if (g) return g;
  try {
    const { lemma, patch } = await req.json();
    if (!lemma || !patch) return NextResponse.json({ error: "lemma and patch required" }, { status: 400, headers: CORS });
    const rows = await patchWord(lemma, patch);
    return NextResponse.json({ ok: true, row: Array.isArray(rows) ? rows[0] : rows }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502, headers: CORS });
  }
}

export async function DELETE(req) {
  const g = guard();
  if (g) return g;
  try {
    const { lemma } = await req.json();
    if (!lemma) return NextResponse.json({ error: "lemma required" }, { status: 400, headers: CORS });
    await removeWord(lemma);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502, headers: CORS });
  }
}
