import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST { password } → set auth cookie if it matches APP_PASSWORD
export async function POST(req) {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return NextResponse.json({ ok: true }); // no password configured
  const { password } = await req.json().catch(() => ({}));
  if (password !== expected) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vocab_auth", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// DELETE → logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vocab_auth", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
