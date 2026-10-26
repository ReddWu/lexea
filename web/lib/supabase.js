// Supabase auth helpers for route handlers and middleware. The session lives
// in @supabase/ssr's sb-<ref>-auth-token cookies; createRouteClient reads them
// from the request and writes refreshed/cleared ones onto `response`.
import { createServerClient } from "@supabase/ssr";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export function createRouteClient(request, response) {
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        if (!response) return;
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
}
