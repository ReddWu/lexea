// Server-only Supabase data access (imported only by /api route handlers).
// Every call runs with the END USER's JWT — RLS on `words` / `learner_profile`
// scopes rows to that user. Callers get the token via getToken(req): the
// extension and iOS app send it as `Authorization: Bearer`, the browser via
// the @supabase/ssr session cookies.
import { SUPABASE_URL as HOST, SUPABASE_KEY, createRouteClient } from "./supabase";

export function configured() {
  return Boolean(HOST && SUPABASE_KEY);
}

// Authorization header (extension / iOS) first, then the SSR session cookie (web).
export async function getToken(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  if (!req.cookies?.getAll || !configured()) return null;
  const { data } = await createRouteClient(req, null).auth.getSession();
  return data?.session?.access_token || null;
}

export async function validateToken(token) {
  if (!token || !configured()) return false;
  try {
    const res = await fetch(`${HOST}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// RLS enforces ownership; the sub claim is only needed to FILL user_id on
// inserts (WITH CHECK rejects rows whose user_id doesn't match the token).
export function userIdFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub || null;
  } catch {
    return null;
  }
}

function headers(token, extra) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, ...extra };
}

async function expectOk(res, what) {
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`unauthorized`);
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return res;
}

const REC = `${HOST}/rest/v1`;

export async function listWords(token, lang) {
  const langFilter = lang ? `&lang=eq.${encodeURIComponent(lang)}` : "";
  const res = await fetch(`${REC}/words?order=due.asc&limit=2000${langFilter}`, {
    headers: headers(token),
    cache: "no-store",
  });
  await expectOk(res, "list");
  return res.json();
}

export async function getWordByLemma(token, lemma, lang = "en") {
  const res = await fetch(
    `${REC}/words?lemma=eq.${encodeURIComponent(lemma)}&lang=eq.${encodeURIComponent(lang)}&limit=1`,
    { headers: headers(token), cache: "no-store" }
  );
  await expectOk(res, "get");
  const rows = await res.json();
  return rows[0] || null;
}

export async function insertWord(token, body) {
  const user_id = userIdFromToken(token);
  const res = await fetch(`${REC}/words`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify([{ lang: "en", ...body, user_id }]),
  });
  await expectOk(res, "insert");
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function patchWord(token, lemma, patch, lang = "en") {
  const res = await fetch(
    `${REC}/words?lemma=eq.${encodeURIComponent(lemma)}&lang=eq.${encodeURIComponent(lang)}`,
    {
      method: "PATCH",
      headers: headers(token, { "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    }
  );
  await expectOk(res, "patch");
  return res.json();
}

export async function removeWord(token, lemma, lang = "en") {
  const res = await fetch(
    `${REC}/words?lemma=eq.${encodeURIComponent(lemma)}&lang=eq.${encodeURIComponent(lang)}`,
    { method: "DELETE", headers: headers(token) }
  );
  await expectOk(res, "delete");
  return true;
}

// --- learner profile (cross-session tutor memory), one row per user ---------

export async function getProfile(token) {
  const res = await fetch(`${REC}/learner_profile?limit=1`, {
    headers: headers(token),
    cache: "no-store",
  });
  await expectOk(res, "get profile");
  const rows = await res.json();
  return rows[0] || null;
}

export async function saveProfile(token, profile) {
  const existing = await getProfile(token);
  if (existing) {
    const res = await fetch(
      `${REC}/learner_profile?user_id=eq.${encodeURIComponent(existing.user_id)}`,
      {
        method: "PATCH",
        headers: headers(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          profile,
          sessions: (existing.sessions || 0) + 1,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    await expectOk(res, "save profile");
    return { sessions: (existing.sessions || 0) + 1 };
  }
  const res = await fetch(`${REC}/learner_profile`, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify([{ user_id: userIdFromToken(token), profile, sessions: 1 }]),
  });
  await expectOk(res, "create profile");
  return { sessions: 1 };
}
