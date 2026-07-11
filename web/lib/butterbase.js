// Server-only Butterbase data access (imported only by /api route handlers).
// Same surface as lib/cloud.js (InsForge) so routes can swap imports.
// Butterbase REST differs from PostgREST in one way that matters here:
// PATCH/DELETE address rows by primary key (/{table}/{id}), not by filter —
// so upserts do a GET-by-lemma first.
// The `contexts` column is TEXT holding a JSON string (Butterbase's Data API
// currently rejects non-empty JSON arrays in jsonb columns); this module
// parses/stringifies at the boundary so callers always see real arrays.

const HOST = (process.env.BUTTERBASE_APP_URL || "").replace(/\/+$/, "");
const KEY = process.env.BUTTERBASE_KEY || "";

function headers(extra) {
  return { Authorization: `Bearer ${KEY}`, ...extra };
}

export function configured() {
  return Boolean(HOST && KEY);
}

function parseRow(r) {
  if (!r) return r;
  if (typeof r.contexts === "string") {
    try {
      r.contexts = JSON.parse(r.contexts);
    } catch {
      r.contexts = [];
    }
  }
  return r;
}

function serializeBody(body) {
  const out = { ...body };
  if (Array.isArray(out.contexts)) out.contexts = JSON.stringify(out.contexts);
  return out;
}

async function expectOk(res, what) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return res;
}

export async function listWords() {
  const res = await fetch(`${HOST}/words?order=due.asc&limit=2000`, {
    headers: headers(),
    cache: "no-store",
  });
  await expectOk(res, "list");
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(parseRow);
}

export async function getWordByLemma(lemma) {
  const res = await fetch(`${HOST}/words?lemma=eq.${encodeURIComponent(lemma.toLowerCase())}&limit=1`, {
    headers: headers(),
    cache: "no-store",
  });
  await expectOk(res, "get");
  const rows = await res.json();
  return rows.length ? parseRow(rows[0]) : null;
}

// --- mutations go through the mia-db serverless function ------------------
// Butterbase single-row PATCH/DELETE routes need a table primary key, and the
// schema DSL currently can't create one — so updates/deletes run as SQL inside
// the app's `mia-db` function. Fn routes require an end-user JWT, so the
// server logs in with MIA_USER_EMAIL/MIA_USER_PASSWORD and caches the token.
const AUTH_BASE = HOST.replace("/v1/", "/auth/");
let jwtCache = { token: null, at: 0 };

async function appJwt(force) {
  if (!force && jwtCache.token && Date.now() - jwtCache.at < 45 * 60 * 1000) return jwtCache.token;
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.MIA_USER_EMAIL,
      password: process.env.MIA_USER_PASSWORD,
    }),
  });
  await expectOk(res, "app login");
  const data = await res.json();
  jwtCache = { token: data.access_token, at: Date.now() };
  return jwtCache.token;
}

async function miaDb(body) {
  let jwt = await appJwt();
  let res = await fetch(`${HOST}/fn/mia-db`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    jwt = await appJwt(true);
    res = await fetch(`${HOST}/fn/mia-db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  await expectOk(res, `mia-db ${body.op}`);
  return res.json();
}

export async function patchWord(lemma, patch) {
  const out = await miaDb({ op: "update", lemma: lemma.toLowerCase(), patch: serializeBody(patch) });
  return parseRow(out.row);
}

export async function insertWord(row) {
  const res = await fetch(`${HOST}/words`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(serializeBody(row)),
  });
  await expectOk(res, "insert");
  return parseRow(await res.json());
}

export async function removeWord(lemma) {
  await miaDb({ op: "delete", lemma: lemma.toLowerCase() });
  return true;
}

// --- learner profile (cross-session memory) --------------------------------
export async function getProfile(userId = "default") {
  const out = await miaDb({ op: "get_profile", user_id: userId });
  return out.profile; // { profile, sessions, updated_at } | null
}

export async function saveProfile(profile, userId = "default") {
  return miaDb({ op: "set_profile", user_id: userId, profile });
}
