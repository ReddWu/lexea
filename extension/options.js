const $ = (id) => document.getElementById(id);

chrome.storage.local
  .get(["autoSave", "cloudSync", "cloudUrl", "cloudKey"])
  .then(({ autoSave, cloudSync, cloudUrl, cloudKey }) => {
    $("autoSave").checked = autoSave !== false; // default on
    $("cloudSync").checked = !!cloudSync;
    $("cloudUrl").value = cloudUrl || "";
    $("cloudKey").value = cloudKey || "";
  });

function setStatus(msg, color) {
  $("status").textContent = msg;
  $("status").style.color = color || "#111827";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoSave: $("autoSave").checked,
    cloudSync: $("cloudSync").checked,
    cloudUrl: $("cloudUrl").value.trim().replace(/\/+$/, ""),
    cloudKey: $("cloudKey").value.trim(),
  });
  setStatus("✓ 已保存", "#16a34a");
});

// upsert one local record to the cloud by lemma (PATCH then POST), real status
async function cloudUpsert(base, key, rec) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };
  const { id, times_used_in_chat, ...body } = rec;
  const patch = await fetch(`${base}/api/database/records/words?lemma=eq.${encodeURIComponent(rec.lemma)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (patch.ok) {
    const rows = await patch.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) return true; // updated existing
  }
  const post = await fetch(`${base}/api/database/records/words`, {
    method: "POST",
    headers,
    body: JSON.stringify([body]),
  });
  return post.ok;
}

$("backfill").addEventListener("click", async () => {
  const base = $("cloudUrl").value.trim().replace(/\/+$/, "");
  const key = $("cloudKey").value.trim();
  if (!base || !key) {
    setStatus("请先填 OSS Host 和 anon key", "#b91c1c");
    return;
  }
  // persist settings first so background sync uses them too
  await chrome.storage.local.set({
    autoSave: $("autoSave").checked,
    cloudSync: $("cloudSync").checked,
    cloudUrl: base,
    cloudKey: key,
  });
  const all = await chrome.storage.local.get(null);
  const words = Object.keys(all)
    .filter((k) => k.startsWith("w:"))
    .map((k) => all[k]);
  if (!words.length) {
    setStatus("本地还没有词", "#b91c1c");
    return;
  }
  let ok = 0;
  for (let i = 0; i < words.length; i++) {
    setStatus(`同步中 ${i}/${words.length}…`, "#6b7280");
    try {
      if (await cloudUpsert(base, key, words[i])) ok++;
    } catch (_e) {
      /* skip */
    }
  }
  setStatus(`✓ 已上传 ${ok}/${words.length} 个词到云端`, ok === words.length ? "#16a34a" : "#b91c1c");
});

$("test").addEventListener("click", async () => {
  const url = $("cloudUrl").value.trim().replace(/\/+$/, "");
  const key = $("cloudKey").value.trim();
  if (!url || !key) {
    setStatus("请先填 OSS Host 和 anon key", "#b91c1c");
    return;
  }
  setStatus("测试中…", "#6b7280");
  try {
    const res = await fetch(`${url}/api/database/records/words?select=id&limit=1`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) setStatus("✓ 连接成功,words 表可访问", "#16a34a");
    else setStatus(`✗ HTTP ${res.status}: ${await res.text()}`, "#b91c1c");
  } catch (e) {
    setStatus("✗ " + e, "#b91c1c");
  }
});
