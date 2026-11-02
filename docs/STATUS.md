# Status

Where the build stands against the build order in SPEC.md. Updated at the end of each working session; the date in the heading is the last update. `git log` is the detailed record, this is the summary.

Last updated: 2026-11-02

## Build order

| By | Ship | Status | Notes |
| --- | --- | --- | --- |
| Sat 2026-11-08 | Repo, schema, 60 seeds, Greenhouse + Lever + Personio adapters, snapshot + diff | Done 2026-11-02 | Two same-day runs: 75 new postings across 8 companies, second run added no rows. Teamtailor adapter added the same day (not on any row; 12 of 75 researched agencies use it). |
| Sun 2026-11-09 | Fingerprint adapter (SFCC, Shopify, commercetools, SCAYLE, Nuxt/Next); 50 retailers | Not started | `adapters/fingerprint/signatures.yaml` exists from the scaffold, unverified. |
| Wed 2026-11-12 | Extraction + Phase 1 rubric + 50-posting eval set | Not started | `rubrics/phase1.md`, `prompts/extract-and-score.md`, `core/extract.schema.json` exist as scaffold text. |
| Sat 2026-11-15 | Grouping, drafting, Telegram digest with buttons; Phase 2 rubric + eval set | Not started | Instantly button removed from v1 on 2026-11-02; Compose is `mailto:` only. |
| Sun 2026-11-16 | Workable, Recruitee, SmartRecruiters, Ashby adapters; seeds to 200 | Not started | 4 current seeds already sit on Workable/Recruitee. Research leftovers for seeds in `universe/_research/`. |
| Week of 11-17 | Send the first 10 approved messages by hand | Not started | |
| Week of 11-24 | Tender-award adapter (TED, Contracts Finder) | Not started | |
| Week of 12-01 | FINA export → 40 Croatian P2 seeds; day-30 review | Not started | |

## Open on the owner

- Remove `INSTANTLY_API_KEY` from `.env.op.example` and commit the file (the agent sandbox cannot read `*.env*` files).
- Add network companies (past clients, current agency's clients, Studion alumni) under the marked block at the end of `universe/companies.yaml`.
- Delete or gitignore `.scaffold.tgz.extracted` at the repo root.

## Known gaps

- Seed coverage: 19 of 60 seeds are polled (11 Teamtailor, 7 Personio, 1 Greenhouse). 36 have `unknown` ATS, mostly in-house job pages; 4 are on vendors due 2026-11-16. No seed uses Lever.
- Seed geography is inverted against the rubric: 20 of the first 60 seeds are German, while the rubric (changed 2026-11-02) ranks the US first and DACH last. US seeds were added the same day; rebalance the EU share when the list goes to 200.
- The geography rows of both rubrics changed on 2026-11-02 with no eval set to check against (rule 5). The 2026-11-12 eval set must be labeled against the new weights.
- Jung von Matt's Personio board is group-wide (copywriters, interns, open applications). Stage 3 filtering must drop non-engineering titles before tokens are spent.
- `core/diff.ts` deletes all of a run date's `events` rows before recomputing them from `postings`. When fingerprint events arrive (Sun 11-09 row), either write them in the same pass or scope the delete to posting kinds.
- kernpunkt's Personio board is live but its `/xml` feed returned 404 on 2026-11-02; recorded as `unknown`.
- `better-sqlite3` was replaced by Node's built-in `node:sqlite` (no native build on Node 26). Node 22.13+ is required wherever the pipeline runs.
