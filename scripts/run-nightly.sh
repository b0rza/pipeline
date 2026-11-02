#!/usr/bin/env bash
# Nightly pipeline. Stages per docs/SPEC.md "Daily run".
set -euo pipefail
cd "$(dirname "$0")/.."
export RUN_DATE="${RUN_DATE:-$(date +%F)}"
mkdir -p logs "out/$RUN_DATE"

echo "[$RUN_DATE] stage 1-2: snapshot + diff"
npm run -s snapshot
npm run -s diff

echo "[$RUN_DATE] stage 3: filter"
npm run -s filter

echo "[$RUN_DATE] stage 4-6: extract, score, draft (headless, no network)"
op run --env-file=.env.op -- \
  claude -p "$(cat prompts/extract-and-score.md)" \
    --output-format json \
    --allowedTools "Read,Write,Bash(sqlite3:*)" \
    --max-turns 40 \
    > "logs/agent-$RUN_DATE.json"

echo "[$RUN_DATE] stage 7: publish"
git add out state/pipeline.sqlite
git commit -qm "data: nightly $RUN_DATE" || true
op run --env-file=.env.op -- npm run -s notify
