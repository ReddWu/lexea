// GET /api/auth/signin — start the Google OAuth flow (PKCE). @supabase/ssr
// stashes the code verifier in a cookie on the redirect response; the login
// page links here and we bounce the browser to Google.
import { NextResponse } from "next/server";
import { createRouteClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL("/login?error=oauth_init", origin));
  const supabase = createRouteClient(request, response);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/api/auth/callback", origin).toString(),
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error("OAuth init failed", error);
    return response;
  }

  response.headers.set("Location", data.url);
  return response;
}
