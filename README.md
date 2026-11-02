# pipeline

Nightly signal pipeline: polls ATS feeds and fingerprints storefronts for a seeded company list, diffs, extracts and scores what's new, drafts one message per company, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC.md`.

Start here: `AGENTS.md`, then `docs/SPEC.md`, `docs/DECISIONS.md`, `docs/PLAN.md`.

```
npm install
npm run db:init
cp .env.op.example .env.op   # fill with op:// refs
RUN_DATE=$(date +%F) ./scripts/run-nightly.sh
```

Export `PIPELINE_USER_AGENT` naming your company and a contact URL, e.g. `pipeline/0.1 (+https://yourcompany.example/contact)`; `run-nightly.sh` reads it from the environment (it is not a secret, so it does not go in `.env.op`).
