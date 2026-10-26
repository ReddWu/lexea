// POST /api/auth/refresh — session probe for AuthNav. Validates (and, if
// needed, refreshes) the cookie session and returns { user } in the shape the
// UI expects: { email, profile: { name, avatar_url } }.
import { NextResponse } from "next/server";
import { createRouteClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const response = NextResponse.json({ user: null });
  const supabase = createRouteClient(request, response);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return NextResponse.json({ user: null }, { status: 401, headers: response.headers });
  }
  const meta = data.user.user_metadata || {};
  const user = {
    id: data.user.id,
    email: data.user.email,
    profile: { name: meta.full_name || meta.name || null, avatar_url: meta.avatar_url || meta.picture || null },
  };
  return NextResponse.json({ user }, { headers: response.headers });
}
