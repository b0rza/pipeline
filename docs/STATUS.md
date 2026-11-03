# Status

Where the build stands against the build order in SPEC.md. Updated at the end of each working session; the date in the heading is the last update. `git log` is the detailed record, this is the summary.

Last updated: 2026-11-03

## Build list (SPEC-v2.md, 2026-11-03)

The v1 build order is retired; rows below are SPEC-v2's, ordered by how much they widen options.

| # | Ship | Status | Notes |
| --- | --- | --- | --- |
| built | Repo, schema, 8 ATS adapters, snapshot + diff, 119 seeds | Done 2026-11-02 | 34 pollable; 301 postings from 29 companies; same-day re-run adds no rows |
| 1 | Stage 3 filter + apply/outreach route | Not started | Keyword rules, no model. Evergreen titles must be dropped (talent pool, Initiativbewerbung, general application) |
| 2 | Telegram digest with Compose / Applied / Skip / Snooze | Not started | Instantly removed 2026-11-02 |
| 3 | ATS coverage: Workable, Recruitee, SmartRecruiters, Ashby, GoHire, Zoho; re-resolve 79 unknowns | Not started | |
| 4 | Warm list in companies.yaml (owner) | Not started | Block exists, empty |
| 5 | Seeds to 200 | Not started | Research leftovers in `universe/_research/` |
| 6 | Reply tracking CLI + Sunday summary by path | Not started | |
| later | Extraction/rubrics/evals, drafting, fingerprinting, enrichment API, agency-page diffs, FINA | Deferred | Unlock conditions in SPEC-v2 "Later" |
| dropped | Tender awards | Dropped 2026-11-03 | CHALLENGE.md finding 10 |

## Open on the owner

- Remove `INSTANTLY_API_KEY` from `.env.op.example` and commit the file (the agent sandbox cannot read `*.env*` files).
- Write the two case-study numbers (members, transactions, team size, timeline) somewhere the agent can read; it drafts the rest.
- Read PLAN.md "The additive frame" once; it is the rule every other doc now follows.
- Add network companies (past clients, current agency's clients, Studion alumni) under the marked block at the end of `universe/companies.yaml`.
- Delete or gitignore `.scaffold.tgz.extracted` at the repo root.

## Known gaps

- Seed coverage: 34 of 119 seeds are polled (11 Teamtailor, 7 Personio, 5 JazzHR, 4 Greenhouse, 3 Rippling, 2 BambooHR, 2 Breezy). 79 have `unknown` ATS, mostly in-house job pages or plain forms; 4 are on vendors in SPEC-v2 row 3, and 2 on GoHire and Zoho Recruit, which have no adapters. No seed uses Lever.
- US coverage: 15 of the 59 US agencies are polled (3 Greenhouse, 5 JazzHR, 3 Rippling, 2 BambooHR, 2 Breezy). JazzHR, BambooHR, Breezy and Rippling adapters were added on 2026-11-02. Two same-day runs gave 45 new postings from 9 US companies, and the second run added no rows. Not covered: First Pier (GoHire) and Ziffity (Zoho Recruit).
- Two JazzHR seeds point at dead boards and fail every run: `avatria` serves "Inactive Career Page", and `redvanworkshop` redirects to jazzhr.com. Re-research where they hire now, or set them to `unknown`. Object Edge's Breezy board is live but has no openings.
- The JazzHR adapter throws when a board page has no `jobs-list` block. That is right for dead boards, but nobody has yet seen a live JazzHR board with zero openings. If such a board also drops the block, the company fails every run instead of marking its postings gone. Check this the first time a JazzHR seed empties. JazzHR, BambooHR and Rippling also fetch one page per posting, and one failed page fails that company's whole run.
- Seed geography: 20 of the 60 EU seeds are German, while the rubric (changed 2026-11-02) ranks DACH last. Rebalance the EU share when the list goes to 200.
- The geography rows of both rubrics changed on 2026-11-02 with no eval set to check against (rule 5). Evals are deferred to Later in SPEC-v2; when they exist they label against the new weights.
- Jung von Matt's Personio board is group-wide (copywriters, interns, open applications). Stage 3 filtering must drop non-engineering titles before tokens are spent.
- `core/diff.ts` deletes all of a run date's `events` rows before recomputing them from `postings`. If fingerprint events ever arrive (SPEC-v2 Later), either write them in the same pass or scope the delete to posting kinds.
- kernpunkt's Personio board is live but its `/xml` feed returned 404 on 2026-11-02; recorded as `unknown`.
- `better-sqlite3` was replaced by Node's built-in `node:sqlite` (no native build on Node 26). Node 22.13+ is required wherever the pipeline runs.
