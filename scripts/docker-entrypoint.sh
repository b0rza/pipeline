#!/usr/bin/env bash
# Container entrypoint. Seeds the database on the volume from the image's git copy on first start, never overwrites
# an existing one, starts Tailscale if TS_AUTHKEY is set (scripts/start-tailscale.sh), then runs the command
# (scripts/serve.ts by default) as the container's main process so it gets SIGTERM.
set -euo pipefail

# Every line starts with the local date and time (TZ on the service), so the container log says when it happened.
log() { echo "$(date '+%F %T') entrypoint: $*"; }

DB="${PIPELINE_DB:-/data/pipeline.sqlite}"
if [ -e "$DB" ]; then
  log "using the existing database at $DB"
else
  mkdir -p "$(dirname "$DB")"
  # Copied under a temporary name first, so a start killed mid-copy leaves no half database to be "existing" next time.
  cp /app/state/pipeline.sqlite "$DB.seeding"
  mv "$DB.seeding" "$DB"
  log "database seeded from the image at $DB"
fi
mkdir -p /data/out

# Puts the page on the owner's tailnet when TS_AUTHKEY is set. Its failure must never stop the bot: the script prints
# its own WARNING and the start carries on.
"$(dirname "$0")/start-tailscale.sh" || true
# Only the first login needs the key; the main process does not.
unset TS_AUTHKEY

exec "$@"
