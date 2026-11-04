# pipeline

Nightly signal pipeline: polls ATS feeds for a seeded company list, diffs, splits what's new into an apply list and an outreach list, writes the record to `out/`, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC-v2.md`.

Start here: `AGENTS.md`, then `docs/SPEC-v2.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/STATUS.md`.

```
npm install
RUN_DATE=$(date +%F) ./scripts/run-nightly.sh
```

Node 22.13 or newer (the database is `node:sqlite`). Without Telegram configured the script prints the digest at the end instead of sending it.

## Secrets

Two environment variables: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The nightly script sources `~/.config/pipeline/env` when it exists (override the path with `PIPELINE_ENV_FILE`); a deployment host such as Coolify sets them on the service instead. Values never go in a file inside this repo.

```
mkdir -p ~/.config/pipeline
printf 'TELEGRAM_BOT_TOKEN=...\nTELEGRAM_CHAT_ID=...\n' > ~/.config/pipeline/env
chmod 600 ~/.config/pipeline/env
```

`npm run bot` runs the button handler as a long-running process with the same two variables. `TELEGRAM_DRY_RUN=1 npm run notify` prints the digest instead of sending it.
