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
