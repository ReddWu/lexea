// POST /api/auth/signout — clear the session cookies and end the session.
import { NextResponse } from "next/server";
import { createRouteClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  await createRouteClient(request, response).auth.signOut();
  return response;
}
