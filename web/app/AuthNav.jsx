"use client";

import { useEffect, useState } from "react";

export default function AuthNav() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Our refresh route returns { accessToken, user } when the httpOnly
    // refresh cookie is valid (and rotates the access-token cookie). It is
    // the one auth probe that works on a cold load — the SDK browser client
    // can't resolve the user from the access-token cookie alone.
    fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setUser(d?.user || null);
      })
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  if (loading) return <span style={{ width: 60 }} />;
  if (!user)
    return (
      <a className="pill" href="/api/auth/signin">
        Sign in
      </a>
    );

  const name = user.profile?.name || user.email;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {user.profile?.avatar_url ? (
        <img
          src={user.profile.avatar_url}
          alt=""
          width={22}
          height={22}
          style={{ borderRadius: "50%" }}
        />
      ) : null}
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{name}</span>
      <button
        onClick={signOut}
        style={{
          font: "inherit",
          fontSize: 13,
          background: "none",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          textDecoration: "underline",
          padding: 0,
        }}
      >
        Sign out
      </button>
    </span>
  );
}
