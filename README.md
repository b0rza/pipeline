# pipeline

Nightly signal pipeline: polls ATS feeds and fingerprints storefronts for a seeded company list, diffs, extracts and scores what's new, drafts one message per company, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC.md`.

Start here: `AGENTS.md`, then `docs/SPEC.md`, `docs/DECISIONS.md`, `docs/PLAN.md`.

```
npm install
npm run db:init
cp .env.op.example .env.op   # fill with op:// refs
RUN_DATE=$(date +%F) ./scripts/run-nightly.sh
```
