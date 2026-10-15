export const runtime = "edge";

import { NextResponse } from "next/server";
import { listWords, patchWord, removeWord, configured, getToken } from "../../../lib/cloud";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function guard(req) {
  if (!configured()) {
    return NextResponse.json(
      { error: "Server not configured: set INSFORGE_OSS_HOST." },
      { status: 500, headers: CORS }
    );
  }
  if (!getToken(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  return null;
}

function fail(e) {
  const status = e.status === 401 ? 401 : 502;
  return NextResponse.json({ error: String(e.message || e) }, { status, headers: CORS });
}

export async function GET(req) {
  const g = guard(req);
  if (g) return g;
  try {
    const lang = req.nextUrl?.searchParams?.get("lang") || null;
    return NextResponse.json({ words: await listWords(getToken(req), lang) }, { headers: CORS });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req) {
  const g = guard(req);
  if (g) return g;
  try {
    const { lemma, patch, lang } = await req.json();
    if (!lemma || !patch) return NextResponse.json({ error: "lemma and patch required" }, { status: 400, headers: CORS });
    const rows = await patchWord(getToken(req), lemma, patch, lang || "en");
    return NextResponse.json({ ok: true, row: Array.isArray(rows) ? rows[0] : rows }, { headers: CORS });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req) {
  const g = guard(req);
  if (g) return g;
  try {
    const { lemma, lang } = await req.json();
    if (!lemma) return NextResponse.json({ error: "lemma required" }, { status: 400, headers: CORS });
    await removeWord(getToken(req), lemma, lang || "en");
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return fail(e);
  }
}
