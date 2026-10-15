// GET /api/auth/callback — OAuth redirect target. Exchanges insforge_code for
// a session; the SSR helper writes insforge_access_token (browser-readable)
// and insforge_refresh_token (httpOnly) cookies.
import { NextResponse } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError || !code) {
    if (oauthError) console.warn("OAuth callback failed", oauthError);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const codeVerifier = request.cookies.get("insforge_code_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/login?error=missing_verifier", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  // NOTE: createAuthActions() strips accessToken from the returned data — the
  // tokens land in cookies only. Success is signalled by error === null + user.
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);
  if (error || !data?.user) {
    console.error("OAuth code exchange failed", error || "no user in response");
    return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  }

  response.cookies.delete("insforge_code_verifier");
  return response;
}
