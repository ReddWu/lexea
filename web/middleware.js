import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "./lib/supabase";

// Refresh the Supabase session cookies before anything renders. Refreshed
// cookies go onto the request too, so route handlers downstream read the new
// access token instead of re-spending the already-rotated refresh token.
// Data access is protected per-user by RLS; pages redirect to /login
// client-side when there is no session.
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mia-extension.zip).*)"],
};
