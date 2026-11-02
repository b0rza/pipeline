# AGENTS.md

This repo is a nightly signal pipeline: it finds companies worth contacting, drafts a message per company, and sends the owner a Telegram digest. The owner sends. Nothing here sends on its own.

## Read first

- `docs/SPEC.md`: what v1 is, stage by stage, with data model and build order.
- `docs/DECISIONS.md`: choices already made and why. Don't propose reversing one without a new fact.
- `docs/PLAN.md`: the business plan this serves. Explains why Phase 1 and Phase 2 rubrics differ.

## Hard rules

1. **No sending.** No code path may send email or post to a third party on the owner's behalf. The Compose action prepares a `mailto:` link; the owner presses send.
2. **No network in the model stage.** Stages 4–6 (extract, score, draft) run via headless Claude Code with `--allowedTools "Read,Write,Bash(sqlite3:*)"`. All fetching happens in deterministic code in stages 1–2. Don't add fetch, curl, or HTTP clients to anything under `core/extract`, `core/score`, `core/draft`, or `prompts/`.
3. **No LinkedIn, Indeed, Glassdoor.** Not as sources, not as enrichment, not via third-party wrappers.
4. **Rate limits are not optional.** 1 req/s per host, backoff on 429/5xx, 24h skip after 3 failures. Real User-Agent naming the company and a contact URL. Respect robots.txt on the Playwright path.
5. **Rubric edits must pass evals.** Change `rubrics/*.md` only together with a passing `evals/run.ts`. If evals move more than 10% of labeled postings across bands, stop and report; don't tune the eval set to pass.
6. **Idempotent runs.** Everything keyed by content hash. Re-running the same day must produce no new rows.
7. **One signal per company per run.** `core/group.ts` collapses postings. Never emit per-posting drafts.
8. **Secrets via `op run`.** Never write a token into a file in this repo, including `.env.example` with real values.

## Conventions

- TypeScript, Node, ESM. `npm run` scripts; no global installs assumed.
- SQLite at `state/pipeline.sqlite`, schema in `state/schema.sql`. Migrations are numbered files in `state/migrations/`.
- Every adapter normalizes to the `postings` shape in SPEC.md. Adapter-specific fields go in `raw`.
- Output files in `out/YYYY-MM-DD/` are the record of what was sent to Telegram. Don't edit them after the fact.
- Commit messages: `feat(ats): ...`, `fix(fingerprint): ...`, `data: nightly 2026-11-17`. Nightly runs commit as `data:`.

## When unsure

Prefer a smaller change that ships over a larger one that doesn't. If a step needs a decision the docs don't cover, write the options in a `## Open question` block at the top of the relevant file and stop; the owner decides.
