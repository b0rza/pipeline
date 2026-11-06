#!/usr/bin/env bash
# Nightly pipeline. Stages per docs/SPEC.md "Daily run".
# Stages not built yet are skipped so the script exits 0 while the build order is in progress.
# PIPELINE_NO_COMMIT=1 skips the git commit (for testing).
# Secrets come from the environment. PIPELINE_ENV_FILE (default ~/.config/pipeline/env) is sourced when it exists;
# on a host that sets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID itself (Coolify) no file is needed.
set -euo pipefail
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
