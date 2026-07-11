#!/bin/bash
# deploy.sh — build the Next.js app with next-on-pages and ship it to
# Butterbase Edge SSR (mia.butterbase.dev). Run from anywhere.
# Requires: BUTTERBASE_KEY env var.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP=app_qxdg80kgznpl

echo "→ building (next-on-pages)…"
cd "$ROOT/web"
npm_config_legacy_peer_deps=true npx -y @cloudflare/next-on-pages@latest > /tmp/mia-nop.log 2>&1 \
  || { tail -20 /tmp/mia-nop.log; exit 1; }

echo "→ zipping worker output…"
cd "$ROOT/web/.vercel/output/static"
rm -f /tmp/edge-ssr.zip
zip -qr /tmp/edge-ssr.zip .

cd "$ROOT"
echo "→ creating deployment…"
./tools/bb.sh manage_edge_ssr "{\"app_id\":\"$APP\",\"action\":\"create\",\"framework\":\"nextjs-edge\"}" \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); open('/tmp/edge-dep.txt','w').write(d['deployment_id']); open('/tmp/edge-url.txt','w').write(d['uploadUrl'])"

echo "→ uploading…"
curl -s -X PUT "$(cat /tmp/edge-url.txt)" -H "Content-Type: application/zip" \
  --data-binary @/tmp/edge-ssr.zip -o /dev/null -w "  upload: %{http_code}\n"

echo "→ starting…"
./tools/bb.sh manage_edge_ssr "{\"app_id\":\"$APP\",\"action\":\"start\",\"deployment_id\":\"$(cat /tmp/edge-dep.txt)\"}" \
  | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(' ', d.get('status'), d.get('url'))"
