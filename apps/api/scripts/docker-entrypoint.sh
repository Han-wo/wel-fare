#!/bin/sh
set -eu

echo "[api-entrypoint] running migrations"
node dist/database/run-migrations.js

echo "[api-entrypoint] starting api"
exec node dist/main
