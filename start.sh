#!/usr/bin/env bash
set -euo pipefail

STARTER_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js is required to run this board.\n' >&2
  exit 1
fi
exec node "$STARTER_ROOT/task-board/server.mjs" "$@"
