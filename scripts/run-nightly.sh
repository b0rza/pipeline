#!/usr/bin/env bash
# Nightly pipeline. Stages per docs/SPEC.md "Daily run".
# Stages not built yet are skipped so the script exits 0 while the build order is in progress.
# PIPELINE_NO_COMMIT=1 skips the git commit (for testing).
# Secrets come from the environment. PIPELINE_ENV_FILE (default ~/.config/pipeline/env) is sourced when it exists;
# on a host that sets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID itself (Coolify) no file is needed.
set -euo pipefail

# Every line this run prints, its own and the stages', stdout and stderr, starts with the local date and time
# (`2026-11-06 19:42:10 `), so the scheduled task's log shows when things happened. The script runs itself again
# with both streams merged into one pipe, which keeps line order, and stamps each line. The pipeline waits for the
# stamper to drain, so nothing is cut off at the end, and its status is the inner run's, so a failing stage still
# fails the run. `date` per line rather than printf '%(...)T', which the bash 3.2 on macOS does not have.
if [ -z "${PIPELINE_LOG_STAMPED:-}" ]; then
  export PIPELINE_LOG_STAMPED=1
  status=0
  "$BASH" "$0" "$@" 2>&1 | while IFS= read -r line || [ -n "$line" ]; do
    printf '%s %s\n' "$(date '+%F %T')" "$line"
  done || status=$?
  exit "$status"
fi

cd "$(dirname "$0")/.."
export RUN_DATE="${RUN_DATE:-$(date +%F)}"
mkdir -p logs "out/$RUN_DATE"

ENV_FILE="${PIPELINE_ENV_FILE:-$HOME/.config/pipeline/env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

echo "[$RUN_DATE] stage 1-2: snapshot + diff"
npm run -s snapshot
npm run -s diff

if [ -f core/filter.ts ]; then
  echo "[$RUN_DATE] stage 3: filter"
  npm run -s filter
else
  echo "stage 3: not built yet"
fi

if [ -f core/extract.ts ]; then
  echo "[$RUN_DATE] stage 4-6: extract, score, draft (headless, no network)"
  claude -p "$(cat prompts/extract-and-score.md)" \
    --output-format json \
    --allowedTools "Read,Write,Bash(sqlite3:*)" \
    --max-turns 40 \
    > "logs/agent-$RUN_DATE.json"
else
  echo "stage 4-6: deferred (SPEC-v2 Later)"
fi

echo "[$RUN_DATE] stage 7: publish"
if [ -f core/filter.ts ]; then
  npm run -s publish
fi
if [ "${PIPELINE_NO_COMMIT:-}" = 1 ]; then
  echo "stage 7: commit skipped (PIPELINE_NO_COMMIT=1)"
else
  # The bot and the UI keep connections open, so closing ours does not checkpoint the WAL.
  npm run -s checkpoint
  git add out state/pipeline.sqlite
  git diff --cached --quiet || git commit -qm "data: nightly $RUN_DATE"
fi
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  npm run -s notify
else
  echo "stage 7: no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, printing the digest instead of sending it"
  TELEGRAM_DRY_RUN=1 npm run -s notify
fi
