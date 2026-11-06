#!/usr/bin/env bash
# Joins the owner's tailnet as its own device and forwards the device's HTTPS tailnet address to the overview page, so
# the page is reachable over Tailscale and from nowhere else. Called by scripts/docker-entrypoint.sh before the main
# process starts. Off unless TS_AUTHKEY is set.
# Never stops the container: any failure prints a WARNING with the end of tailscaled's log, exits non-zero, and the
# entrypoint carries on with the bot and the page.
# The key is used for the first login only. The device identity is kept in /data/tailscale on the volume, and later
# starts log in from it without the key: a one-time key is used up by the first login, and every key expires.
# No root, no TUN device, no extra capabilities: tailscaled runs as the node user in userspace networking mode.
# Never Funnel (Tailscale's public-internet feature): the serve config is reset and set to one tailnet-only forward.
set -euo pipefail

# Every line starts with the local date and time (TZ on the service), so the container log says when it happened.
log() { echo "$(date '+%F %T') tailscale: $*"; }
# Stamps each line the tailscale CLI prints.
stamp() { while IFS= read -r line; do log "$line"; done; }

if [ -z "${TS_AUTHKEY:-}" ]; then
  log "off (TS_AUTHKEY is not set), the page is reachable only inside the container"
  exit 0
fi

STATE_DIR=/data/tailscale
SOCK=/tmp/tailscaled.sock
LOG=/tmp/tailscaled.log
TS_HOST="${TS_HOSTNAME:-pipeline}"
UI_PORT="${PIPELINE_UI_PORT:-8787}"
UP_TIMEOUT=30s
KEY_FILE=""
WARNED=""

ts() { tailscale --socket="$SOCK" "$@"; }
# Reads one value from JSON on stdin; the argument is a JavaScript expression over j.
json() { node -p "const j = JSON.parse(require('fs').readFileSync(0, 'utf8')); $1"; }
warn() {
  log "WARNING: $*. The bot and the page carry on, but the page is not reachable over Tailscale."
  WARNED=1
  exit 1
}
finish() {
  local code=$?
  if [ -n "$KEY_FILE" ]; then rm -f "$KEY_FILE"; fi
  if [ "$code" -ne 0 ]; then
    # A command that failed outside warn() (set -e) still gets its WARNING.
    if [ -z "$WARNED" ]; then
      log "WARNING: start failed (exit $code). The bot and the page carry on, but the page is not reachable over Tailscale."
    fi
    log "last lines of $LOG:"
    tail -n 15 "$LOG" 2>/dev/null | sed 's/^/  | /' || true
  fi
}
trap finish EXIT

log "starting tailscaled (userspace networking, state in $STATE_DIR, its log in $LOG)"
mkdir -p "$STATE_DIR"
# tailscaled never needs the key; the login below hands it over through a file.
env -u TS_AUTHKEY tailscaled --tun=userspace-networking --statedir="$STATE_DIR" --socket="$SOCK" \
  </dev/null >"$LOG" 2>&1 &
DAEMON=$!

# Waits up to 15 seconds for the daemon to answer with a backend state other than NoState (still loading).
state=""
for _ in $(seq 30); do
  kill -0 "$DAEMON" 2>/dev/null || warn "tailscaled exited during start"
  state="$(ts status --json 2>/dev/null | json 'j.BackendState' 2>/dev/null || true)"
  if [ -n "$state" ] && [ "$state" != NoState ]; then break; fi
  sleep 0.5
done
if [ -z "$state" ] || [ "$state" = NoState ]; then
  kill "$DAEMON" 2>/dev/null || true
  warn "tailscaled did not answer within 15 seconds and was stopped"
fi

if [ "$state" = NeedsLogin ]; then
  log "not logged in yet, logging in with TS_AUTHKEY as $TS_HOST"
  # The key goes in a file readable only by this user, so it never shows on a command line.
  KEY_FILE="$(mktemp /tmp/tskey.XXXXXX)"
  printf '%s' "$TS_AUTHKEY" >"$KEY_FILE"
  ts up --auth-key="file:$KEY_FILE" --hostname="$TS_HOST" --timeout="$UP_TIMEOUT" 2>&1 | stamp \
    || warn "login with TS_AUTHKEY did not finish within $UP_TIMEOUT (a used one-time key, an expired key or no network)"
  rm -f "$KEY_FILE"
  KEY_FILE=""
else
  log "device identity found in $STATE_DIR (state $state), starting without the key"
  ts up --hostname="$TS_HOST" --timeout="$UP_TIMEOUT" 2>&1 | stamp \
    || warn "tailscale did not reach Running within $UP_TIMEOUT (device removed, node key expired, approval pending or no network)"
fi

status="$(ts status --json)"
DNS_NAME="$(json 'j.Self.DNSName.replace(/\.$/, "")' <<<"$status")"
log "logged in as device $(json 'j.Self.HostName' <<<"$status"), $DNS_NAME ($(json 'j.Self.TailscaleIPs.join(", ")' <<<"$status"))"

# Reset first, so every start leaves exactly one forward and nothing else, Funnel included.
ts serve reset 2>&1 | stamp || warn "could not clear the serve configuration"
# The CLI may wait for HTTPS to be enabled in the tailnet, so it gets a bound too.
timeout 30 tailscale --socket="$SOCK" serve --bg --yes --https=443 "http://127.0.0.1:$UI_PORT" 2>&1 >/dev/null | stamp \
  || warn "could not set the HTTPS forward to port $UI_PORT (are HTTPS certificates enabled in the tailnet's DNS settings?)"
if [ "$(ts serve status --json | json 'Object.values(j.AllowFunnel ?? {}).some(Boolean)')" != false ]; then
  ts serve reset || true
  warn "Funnel came on with the forward, so the forward was removed"
fi
ts serve status | stamp
log "the page is at https://$DNS_NAME/ (tailnet only)"
