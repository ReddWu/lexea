"use client";

import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "密码错误");
      }
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>🔒 单词复习</h1>
      <form onSubmit={submit}>
        <input
          type="password"
          placeholder="输入访问密码"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        <div className="err">{err}</div>
        <button className="btn blue" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "…" : "进入"}
        </button>
      </form>
    </div>
  );
}
