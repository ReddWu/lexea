import { NextResponse } from "next/server";

// Optional password gate. If APP_PASSWORD is unset, the site is open.
export function middleware(req) {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("vocab_auth")?.value;
  if (cookie === pw) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
