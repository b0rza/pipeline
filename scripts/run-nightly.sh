#!/usr/bin/env bash
# Nightly pipeline. Stages per docs/SPEC.md "Daily run".
# Stages not built yet are skipped so the script exits 0 while the build order is in progress.
# PIPELINE_NO_COMMIT=1 skips the git commit (for testing).
set -euo pipefail
: "${PIPELINE_USER_AGENT:?set PIPELINE_USER_AGENT (AGENTS.md rule 4)}"
cd "$(dirname "$0")/.."
export RUN_DATE="${RUN_DATE:-$(date +%F)}"
mkdir -p logs "out/$RUN_DATE"

echo "[$RUN_DATE] stage 1-2: snapshot + diff"
npm run -s snapshot
npm run -s diff

if [ -f core/filter.ts ]; then
  echo "[$RUN_DATE] stage 3: filter"
  npm run -s filter
else
  echo "stage 3: not built yet"
fi

if [ -f core/filter.ts ] && [ -f .env.op ]; then
  echo "[$RUN_DATE] stage 4-6: extract, score, draft (headless, no network)"
  op run --env-file=.env.op -- \
    claude -p "$(cat prompts/extract-and-score.md)" \
      --output-format json \
      --allowedTools "Read,Write,Bash(sqlite3:*)" \
      --max-turns 40 \
      > "logs/agent-$RUN_DATE.json"
else
  echo "stage 4-6: not built yet"
fi

echo "[$RUN_DATE] stage 7: publish"
if [ "${PIPELINE_NO_COMMIT:-}" = 1 ]; then
  echo "stage 7: commit skipped (PIPELINE_NO_COMMIT=1)"
else
  git add out state/pipeline.sqlite
  git diff --cached --quiet || git commit -qm "data: nightly $RUN_DATE"
fi
if [ -f bot/notify.ts ]; then
  op run --env-file=.env.op -- npm run -s notify
else
  echo "stage 7: notify not built yet"
fi
