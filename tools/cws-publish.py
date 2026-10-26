#!/usr/bin/env python3
"""Upload a store zip to the Chrome Web Store and submit it for review.

  python3 tools/cws-publish.py auth                      # one-time: browser consent -> refresh token
  python3 tools/cws-publish.py upload dist/<zip>         # upload the package as a draft
  python3 tools/cws-publish.py publish                   # submit the uploaded draft for review
  python3 tools/cws-publish.py status                    # show the item's upload state

Reads the OAuth desktop client from .secrets/cws-client.json and keeps the
refresh token in .secrets/cws-refresh-token (both gitignored).
"""
import http.server
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.path.join(ROOT, ".secrets", "cws-client.json")
REFRESH = os.path.join(ROOT, ".secrets", "cws-refresh-token")
ITEM_ID = "bakaoahlcnpnefebfoiogckiaiehngmk"
SCOPE = "https://www.googleapis.com/auth/chromewebstore"
PORT = 8797


def client():
    with open(CLIENT) as f:
        return json.load(f)["installed"]


def post_form(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode())
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def auth():
    c = client()
    redirect = f"http://localhost:{PORT}"
    url = c["auth_uri"] + "?" + urllib.parse.urlencode({
        "client_id": c["client_id"], "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent",
    })
    print("Open this URL and approve:\n" + url, flush=True)
    code = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Done - you can close this tab.")

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", PORT), H)
    while "code" not in code and "error" not in code:
        srv.handle_request()
    if "error" in code:
        sys.exit("auth failed: " + code["error"])
    tok = post_form(c["token_uri"], {
        "code": code["code"], "client_id": c["client_id"], "client_secret": c["client_secret"],
        "redirect_uri": redirect, "grant_type": "authorization_code",
    })
    if "refresh_token" not in tok:
        sys.exit("no refresh token in response")
    fd = os.open(REFRESH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(tok["refresh_token"])
    print("saved refresh token")


def access_token():
    c = client()
    with open(REFRESH) as f:
        rt = f.read().strip()
    return post_form(c["token_uri"], {
        "refresh_token": rt, "client_id": c["client_id"], "client_secret": c["client_secret"],
        "grant_type": "refresh_token",
    })["access_token"]


def call(method, url, body=None):
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": "Bearer " + access_token(), "x-goog-api-version": "2",
    })
    if body is None and method == "POST":
        req.add_header("Content-Length", "0")
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "auth":
        auth()
    elif cmd == "upload":
        with open(sys.argv[2], "rb") as f:
            print(json.dumps(call("PUT", f"https://www.googleapis.com/upload/chromewebstore/v1.1/items/{ITEM_ID}", f.read()), indent=2))
    elif cmd == "publish":
        print(json.dumps(call("POST", f"https://www.googleapis.com/chromewebstore/v1.1/items/{ITEM_ID}/publish"), indent=2))
    elif cmd == "status":
        print(json.dumps(call("GET", f"https://www.googleapis.com/chromewebstore/v1.1/items/{ITEM_ID}?projection=DRAFT"), indent=2))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
