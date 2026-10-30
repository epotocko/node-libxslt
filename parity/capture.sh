#!/bin/bash
# Records libxslt 0.10.2's behavior on the parity corpus (parity/golden/xslt.json).
# Usage: parity/capture.sh [private-corpus-dir]
#   The private corpus (XSLT layout, may hold PII) gets its golden.json written inside it.
set -euo pipefail
cd "$(dirname "$0")/.."

PRIVATE_DIR=${1:-${PARITY_PRIVATE_DIR:-}}
docker build -q -f parity/legacy.Dockerfile -t node-libxslt-legacy parity > /dev/null

args=(--rm --user "$(id -u):$(id -g)" -v "$PWD":/src -w /src)
if [ -n "$PRIVATE_DIR" ]; then
	args+=(-v "$(cd "$PRIVATE_DIR" && pwd)":/private -e PARITY_PRIVATE_DIR=/private)
fi
docker run "${args[@]}" node-libxslt-legacy node parity/capture.js
