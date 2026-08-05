#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Keep dependencies and the development database aligned after task merges.
# All commands are non-interactive because the merge hook has no stdin.
npm install --no-audit --no-fund
npm run db:push -- --force
npm run build