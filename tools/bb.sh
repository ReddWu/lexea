#!/bin/bash
# bb.sh — call a Butterbase MCP tool via JSON-RPC over HTTP (stateless).
# Usage: ./bb.sh <tool_name> '<json_arguments>'
# Requires: BUTTERBASE_KEY env var (bb_sk_...)
set -euo pipefail
KEY="${BUTTERBASE_KEY:?set BUTTERBASE_KEY}"
TOOL="$1"
ARGS="${2:-{\}}"

payload=$(python3 - "$TOOL" "$ARGS" <<'EOF'
import json, sys
print(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":sys.argv[1],"arguments":json.loads(sys.argv[2])}}))
EOF
)

curl -s -X POST "https://api.butterbase.ai/mcp" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$payload" | python3 -c "
import json, sys
out = None
for line in sys.stdin.read().splitlines():
    line = line.strip()
    if not line.startswith('data:'):
        continue
    try:
        d = json.loads(line[5:].strip())
    except Exception:
        continue
    if d.get('id') == 2:
        out = d
if out is None:
    print('no result', file=sys.stderr); sys.exit(1)
r = out.get('result', out.get('error', out))
if isinstance(r, dict) and 'content' in r:
    for c in r['content']:
        if c.get('type') == 'text':
            print(c['text'])
    if r.get('isError'): sys.exit(1)
else:
    print(json.dumps(r, ensure_ascii=False, indent=2))
"
