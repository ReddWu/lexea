// mia-db — server-side write operations for the Mia app.
// Butterbase's Data API needs a table primary key for single-row PATCH/DELETE,
// and the schema DSL currently can't create one — so mutations run here as
// parameterized SQL via ctx.db instead. Invoked with an end-user JWT.
//
// POST { op: "update"|"delete", lemma, patch? }
// POST { op: "get_profile"|"set_profile", user_id?, profile? }
const COLS = new Set([
  "word","translation","definition","phonetic","context","contexts","source_url",
  "source_title","state","due","ease","interval_days","reps","lapses","last_review",
  "times_used_in_chat","status","updated_at",
]);

export default async function handler(req, ctx) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  try {
    // --- learner profile (cross-session memory) ---
    if (body.op === "get_profile" || body.op === "set_profile") {
      const userId = String(body.user_id || "default").slice(0, 100);
      if (body.op === "get_profile") {
        const r = await ctx.db.query(
          "select profile, sessions, updated_at from learner_profile where user_id = $1",
          [userId]
        );
        return json({ ok: true, profile: r.rows[0] || null });
      }
      const r = await ctx.db.query(
        `insert into learner_profile (user_id, profile, sessions, updated_at)
         values ($1, $2, 1, now())
         on conflict (user_id) do update
           set profile = $2, sessions = learner_profile.sessions + 1, updated_at = now()
         returning sessions`,
        [userId, String(body.profile || "")]
      );
      return json({ ok: true, sessions: r.rows[0].sessions });
    }

    // --- word mutations ---
    const lemma = String(body.lemma || "").trim().toLowerCase();
    if (!lemma) return json({ error: "lemma required" }, 400);

    if (body.op === "delete") {
      const r = await ctx.db.query("delete from words where lemma = $1 returning lemma", [lemma]);
      return json({ ok: true, deleted: r.rows.length });
    }
    if (body.op === "update") {
      const patch = body.patch || {};
      const keys = Object.keys(patch).filter((k) => COLS.has(k));
      if (!keys.length) return json({ error: "no valid columns in patch" }, 400);
      const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
      const vals = keys.map((k) => {
        const v = patch[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const r = await ctx.db.query(
        `update words set ${sets} where lemma = $1 returning *`,
        [lemma, ...vals]
      );
      if (!r.rows.length) return json({ error: "word not found", lemma }, 404);
      return json({ ok: true, row: r.rows[0] });
    }
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
