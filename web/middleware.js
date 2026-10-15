import { NextResponse } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";

// Refresh the InsForge session cookies before anything renders. Data access
// is protected per-user by RLS; pages redirect to /login client-side when
// there is no session.
export async function middleware(request) {
  const response = NextResponse.next({ request });
  await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mia-extension.zip).*)"],
};
