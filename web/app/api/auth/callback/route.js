// GET /api/auth/callback — OAuth redirect target. Exchanges ?code= (plus the
// verifier cookie set by /api/auth/signin) for a session; @supabase/ssr writes
// the session cookies onto the redirect response.
import { NextResponse } from "next/server";
import { createRouteClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError || !code) {
    if (oauthError) console.warn("OAuth callback failed", oauthError);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  const supabase = createRouteClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.user) {
    console.error("OAuth code exchange failed", error || "no user in response");
    return NextResponse.redirect(new URL("/login?error=exchange_failed", request.url));
  }
  return response;
}
