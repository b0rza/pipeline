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

# The run's outcome on its row in `runs`, for the overview page's last-run line: core/runs.ts `finish` at the end, or
# `fail <stage> <last error line>` from the exit trap when something fails and set -e ends the script. This is the inner
# run (the stamping wrapper above only pipes it), so the trap's own lines are stamped too. `stage` is the label of the
# `[RUN_DATE] stage …` line last printed. step() runs a stage command with both its streams merged at the command, as
# the wrapper merged them before, and copies them to STEP_LOG, so the trap can pick the error line out of them.
stage=setup
in_step=0
step_cmd=
failed_cmd=
STEP_LOG="$(mktemp "${TMPDIR:-/tmp}/pipeline-step.XXXXXX")"
step() {
  in_step=1
  step_cmd="$*"
  "$@" 2>&1 | tee "$STEP_LOG"
  in_step=0
}
# The last `Error: …` line (also TypeError, GrammyError, `Error [ERR_…]`) of the failing step's output; else its last line
# that is not a stack frame or Node's version footer; else which command exited with which status.
last_error_line() {
  local line=
  if [ "$in_step" = 1 ]; then
    line="$(grep -E '^[[:space:]]*[A-Za-z]*Error( \[[A-Z_]+\])?: ' "$STEP_LOG" | tail -n 1 || true)"
    [ -n "$line" ] || line="$(grep -vE '^[[:space:]]*($|at |\^|[{}]|Node\.js v)' "$STEP_LOG" | tail -n 1 || true)"
    [ -n "$line" ] || line="$step_cmd exited $1"
  else
    line="${failed_cmd:-a command} exited $1"
  fi
  printf '%s' "$line"
}
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    node --import tsx core/runs.ts fail "$stage" "$(last_error_line "$status")" || true
  fi
  rm -f "$STEP_LOG"
  exit "$status"
}
# ERR fires for a failing command outside step() (functions do not inherit it), to name it when there is no step output.
trap 'failed_cmd=$BASH_COMMAND' ERR
trap on_exit EXIT

mkdir -p logs "out/$RUN_DATE"

ENV_FILE="${PIPELINE_ENV_FILE:-$HOME/.config/pipeline/env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

stage=1-2
echo "[$RUN_DATE] stage 1-2: snapshot + diff"
step npm run -s snapshot
step npm run -s diff

if [ -f core/filter.ts ]; then
  stage=3
  echo "[$RUN_DATE] stage 3: filter"
  step npm run -s filter
else
  echo "stage 3: not built yet"
fi

if [ -f core/extract.ts ]; then
  stage=4-6
  echo "[$RUN_DATE] stage 4-6: extract, score, draft (headless, no network)"
  claude -p "$(cat prompts/extract-and-score.md)" \
    --output-format json \
    --allowedTools "Read,Write,Bash(sqlite3:*)" \
    --max-turns 40 \
    > "logs/agent-$RUN_DATE.json"
else
  echo "stage 4-6: deferred (SPEC-v2 Later)"
fi

stage=7
echo "[$RUN_DATE] stage 7: publish"
if [ -f core/filter.ts ]; then
  step npm run -s publish
fi
if [ "${PIPELINE_NO_COMMIT:-}" = 1 ]; then
  echo "stage 7: commit skipped (PIPELINE_NO_COMMIT=1)"
else
  # The bot and the UI keep connections open, so closing ours does not checkpoint the WAL.
  step npm run -s checkpoint
  git add out state/pipeline.sqlite
  git diff --cached --quiet || git commit -qm "data: nightly $RUN_DATE"
fi
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  step npm run -s notify
else
  echo "stage 7: no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, printing the digest instead of sending it"
  step env TELEGRAM_DRY_RUN=1 npm run -s notify
fi
node --import tsx core/runs.ts finish
