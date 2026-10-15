// GET /api/auth/signin — start the Google OAuth flow (server-side PKCE).
// The login page links here; we stash the code verifier in an httpOnly cookie
// and bounce the browser to Google.
import { NextResponse } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL("/login?error=oauth_init", origin));
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { data, error } = await auth.signInWithOAuth("google", {
    redirectTo: new URL("/api/auth/callback", origin).toString(),
    additionalParams: { prompt: "select_account" },
    skipBrowserRedirect: true,
  });

  if (error || !data?.url || !data?.codeVerifier) {
    console.error("OAuth init failed", error);
    return response;
  }

  const redirect = NextResponse.redirect(data.url);
  redirect.cookies.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return redirect;
}
