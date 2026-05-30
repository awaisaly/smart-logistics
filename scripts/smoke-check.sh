#!/usr/bin/env sh
set -e

echo "Running SmartLogistics smoke checks..."
echo "1) Workspace typecheck"
pnpm typecheck
echo "2) Unit tests (critical paths)"
pnpm test
echo "3) Docker compose config validation"
docker compose config >/dev/null
echo "Smoke checks completed."
