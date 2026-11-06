#!/usr/bin/env bash
# Container entrypoint. Seeds the database on the volume from the image's git copy on first start, never overwrites
# an existing one, then runs the command (the bot by default) as the container's main process so it gets SIGTERM.
set -euo pipefail

DB="${PIPELINE_DB:-/data/pipeline.sqlite}"
if [ -e "$DB" ]; then
  echo "entrypoint: using the existing database at $DB"
else
  mkdir -p "$(dirname "$DB")"
  # Copied under a temporary name first, so a start killed mid-copy leaves no half database to be "existing" next time.
  cp /app/state/pipeline.sqlite "$DB.seeding"
  mv "$DB.seeding" "$DB"
  echo "entrypoint: database seeded from the image at $DB"
fi
mkdir -p /data/out

exec "$@"
