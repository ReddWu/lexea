// POST /api/auth/signout — clear the session cookies and end the session.
import { NextResponse } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });
  await auth.signOut();
  return response;
}
