# pipeline

Nightly signal pipeline: polls ATS feeds and fingerprints storefronts for a seeded company list, diffs, extracts and scores what's new, drafts one message per company, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC.md`.

Start here: `AGENTS.md`, then `docs/SPEC.md`, `docs/DECISIONS.md`, `docs/PLAN.md`.

```
npm install
npm run db:init
cp .env.op.example .env.op   # fill with op:// refs
RUN_DATE=$(date +%F) ./scripts/run-nightly.sh
```

The digest needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the environment. `op run --env-file=.env.op` supplies them; `.env.op.example` lists the names, and values never go in the repo. `npm run bot` runs the button handler as a long-running process. `TELEGRAM_DRY_RUN=1 npm run notify` prints the digest instead of sending it.
