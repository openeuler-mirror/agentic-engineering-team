#!/usr/bin/env bash
# Smoke test for vulinfo.js — both output modes.
# Requires network. Skip if offline.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[test] markdown mode (default)..."
node "$SCRIPT_DIR/vulinfo.js" --id CVE-2026-31431 | head -5 \
  | grep -q "CVE-2026-31431" \
  || { echo "FAIL: markdown mode did not output CVE id"; exit 1; }

echo "[test] json mode (--format=json)..."
JSON_OUT=$(node "$SCRIPT_DIR/vulinfo.js" --id CVE-2026-31431 --format=json)
echo "$JSON_OUT" | node -e '
  let s = ""; process.stdin.on("data", c => s+=c).on("end", () => {
    const j = JSON.parse(s);
    if (j.id !== "CVE-2026-31431") { console.error("FAIL: id mismatch"); process.exit(1); }
    if (!("description" in j)) { console.error("FAIL: missing description"); process.exit(1); }
    console.log("PASS");
  });'

echo "[test] all passed"
