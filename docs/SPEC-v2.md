# Signal Pipeline v2 Spec

Nov 3, 2026 · @yossarian · supersedes SPEC.md (kept as history)

The pipeline polls ATS feeds for a seeded company list nightly, diffs against yesterday, and splits what's new into two lists: contract postings to apply to, and companies to reach by referral or direct message. A Telegram digest delivers both each morning. It serves every income stream in PLAN.md with options; it does not prove any one of them. Rows are ordered by how much they widen options, per DECISIONS.md "Pipeline serves every stream".

What changed from v1: cold outreach is one path of three, not the mechanism; fingerprinting, LLM extraction, tender awards and FINA move to Later; the build list is no longer tied to a review date; Instantly is gone.

## Built (as of 2026-11-03)

- Repo, schema, `events` table, `runs` table
- Adapters: Greenhouse, Lever, Personio, Teamtailor, JazzHR, BambooHR, Breezy, Rippling
- Snapshot + diff, idempotent, same-day re-run safe, repost detection two ways
- 119 seeds; 34 pollable. 79 `unknown` (in-house pages or forms), 2 Workable, 2 Recruitee, 1 GoHire, 1 Zoho
- Two runs: 301 postings from 29 companies; second run added no rows

## Terms

- **Run**: one nightly execution.
- **Posting**: one advertised role at one company.
- **Signal**: one company per run with something worth acting on, carrying all its new postings.
- **Apply list**: signals whose postings are contract/freelance engineering roles. Action: apply through the posting.
- **Outreach list**: all other signals. Action: find a named lead and write, or ask for a referral.

## Build list

Ordered. Each row says which streams it widens.

| # | Ship | Widens | Done when |
| --- | --- | --- | --- |
| 1 | **Stage 3 filter + two-way route.** Drop non-engineering titles and evergreen postings (talent pool, Initiativbewerbung, general application, "always looking"). Flag contract/freelance/interim/fixed-term in title or body → `apply`; else `outreach`. Keyword rules in `core/filter.ts`; no model | Stream 1 (both lists), Stream 2 (outreach) | A run prints two lists; no evergreen rows; every Red Badger contract role lands in `apply` |
| 2 | **Telegram digest.** Header with counts, then one message per signal: company, country, vendor, posting titles with links, list it's on. Buttons: Compose (`mailto:` prefilled, outreach only), Applied / Skip with reason, Snooze 7d. `bot/notify.ts`, `bot/server.ts` | All | Digest on the phone after a run; Applied and Skip update `signals.status` |
| 3 | **ATS coverage** (measured by pollable seed count). Workable, Recruitee, SmartRecruiters, Ashby, GoHire, Zoho Recruit adapters. Re-resolve the 79 `unknown` seeds; those on in-house pages get a per-company Playwright scraper only if they're on the warm list | Stream 1 | Pollable seeds > 60 of 119 |
| 4 | **Warm list.** Owner adds referral paths to `universe/companies.yaml` under the network block: current agency's clients, Studion alumni, past clients. Flagged `warm: true`; always surfaced first in the digest regardless of postings | Stream 1, Stream 2 | Block has ≥ 20 entries |
| 5 | **Seeds to 200.** Partner directories (commercetools, Salesforce Commerce, SCAYLE), Clutch, Shopify Plus / BigCommerce agency lists. US first, then UK, Nordics, Benelux; rebalance away from DE | Stream 1 | 200 seeds, ≥ 100 pollable |
| 6 | **Reply tracking.** `pipe mark <id> sent|applied|replied|skip` CLI; weekly summary in the Sunday digest: replies by path (apply / referral / cold) and by country | All | First weekly summary with real numbers |

## Later, with the condition that unlocks each

| Item | Unlock condition | Note |
| --- | --- | --- |
| LLM extraction + rubrics + evals (v1 stages 4–5) | Digest has more than ~20 signals a day for a week, or more than 1 in 5 digest rows is skipped as "bad fit" | The schema, rubrics and eval format from v1 stand; the urgency factor needs the evergreen filter first |
| Drafting (v1 stage 6) | 20 messages sent by hand, so the template is known | Fixed string template first; model drafting only if the template proves insufficient |
| Fingerprinting (v1 adapter 2) | A fixed-scope product is live and the owner wants "just went live" retailer leads | `platform_changed` only; `platform_added` points at the agency, not the retailer. Signatures in `adapters/fingerprint/signatures.yaml` are unverified |
| Contact enrichment API (Apollo / Hunter / Clay by domain) | Outreach list exceeds what a few hours of manual lookup per 40 covers | Never the owner's LinkedIn account |
| Agency-page diffs (new client logos) | Fixed-scope product live | Same shape as fingerprinting; one adapter |
| FINA export → Croatian Stream 2 seeds | Stream 2 playbook published | Seed source, not a build row |
| Tender awards | Dropped | No buyer in reach; see CHALLENGE.md finding 10 |

## Unchanged from v1

These sections of SPEC.md still apply as written: Repo layout (minus `bot/actions.ts` Instantly), Data model, Adapter 1 (ATS feeds; verify each URL pattern against two live boards), Daily run stages 1–3 and 7, Guardrails. Stages 4–6 are Later.

## Guardrails that stay hard

No sending. No network in any model stage. No LinkedIn/Indeed/Glassdoor scraping. Rate limits per host. Rubric edits pass evals. One signal per company per run. Secrets from the environment, never from a file in the repo.
