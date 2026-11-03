# Challenge pass: SPEC.md, DECISIONS.md, PLAN.md

2026-11-02, evening; disposition added 2026-11-03 after the owner's answers. Written by the author of the three docs, arguing against them. Evidence is the repo as it stood: 119 seeds, 34 polled, 301 postings from 29 companies after two runs. Findings are kept as written; the disposition table says what each one became under the additive frame (PLAN.md, "The additive frame").

## Disposition, 2026-11-03

The owner's answers and the reframing changed the ranking. Three findings rested on a runway and a deadline that don't exist; those are withdrawn or weakened. Four hold as correctness problems regardless of frame.

| # | Finding | Disposition | Why |
| --- | --- | --- | --- |
| 1 | No evidence agencies buy contractors from postings | Weakened to "ratio unknown" | The inference from two data points to the market was the same error the pass was hunting. Red Badger posts 16 contract roles. Public contract postings are a real path; referral is another; reply rate per path decides. Recorded in DECISIONS.md |
| 2 | 12-02 criterion calibrated on nothing | Withdrawn as a failure condition | The date is a beacon, not a pass/fail. The underlying fact stands: cold-contact conversion for this offer is unknown until measured |
| 3 | ATS covers a third of the market, most of it noise | Holds, lower weight | True as measured (34/119 pollable, 34% engineering). Under the additive frame more coverage is always worth adding; the fix is more adapters and a title filter, not a rethink |
| 4 | Fingerprint adapter has no direct buyer | Holds | Deferred in DECISIONS.md with the agency-on-site caveat |
| 5 | Urgency rewards evergreen postings | Holds | Needs an evergreen title filter before any rubric runs |
| 6 | Stream 2 signals point at teams already solving it | Holds | The pipeline contributes nothing to Stream 2 yet; the playbook and direct CTO contact do |
| 7 | US first decided without a record | Resolved | Reasons recorded: rates, bureaucracy, openness to monthly fee. Caveats kept |
| 8 | Extraction and scoring don't earn their build at this volume | Holds, reordered | Moved to "later" in SPEC-v2; a title filter and the two-way route do the job for now |
| 9 | Contact discovery is unbudgeted | Holds, scoped | Manual lookup of one named lead per company is allowed; scraping with the owner's account is not; API enrichment is the automation path. careers@ is the wrong door for selling, the right one for applying |
| 10 | Tender awards: no buyer | Holds | Dropped from the build list |
| 11 | FINA seeds assume a Croatian buyer nobody has met | Holds | Kept as a seed source, not a build row; 5 of 15 Stream 2 messages test it |
| 12 | Rate band borrowed from a different seller | Resolved | Current rate is €55/h. The band is for pricing fixed products; first three quotes correct it |
| 13 | Build order vs the 12-02 criterion | Withdrawn as framed; reordering kept | No criterion to serve. Rows are now ranked by whether they widen options |
| 14 | No branch for losing the current agency | Withdrawn | The contract is stable and there is no runway constraint. The month's notice is good faith, not a plan input. Contract terms are still undocumented; minor |

Owner's answers that drove this: first contract came by referral, no public posting; €55/h, hourly, wants fixed-price products added, not hourly replaced; agency fills overflow by referral; US first for rates, bureaucracy and monthly-fee openness; the 40 were pulled automatically, warmth unknown; no notice period, a month given in good faith; no known Croatian buyer; LinkedIn lookups by hand are fine, scraping with the account is what the spec rules out.

## Findings as written on 2026-11-02

## 1. No evidence agencies buy contractors from postings

Who pays: the agency, when it has overflow it can't staff from its bench. Why me: unknown. The plan asserts agencies "lack senior people who can run a storefront without supervision"; the data shows agencies filling that gap offshore (IONA hiring in the Philippines, TOWA in Kraków) and through perm hires. Of 301 postings, 19 carry contract/freelance in the title, 16 of them at Red Badger. A perm "Senior Tech Lead" posting is evidence the agency has a gap, not that it will fill it with a €600/day remote contractor from Croatia. What would make this wrong: agencies hire contractors through recruiters and networks, never via their ATS, so the ATS never shows the demand we sell into. Evidence: none beyond your own hiring, which came through an agency relationship, not a posting.

## 2. The 2026-12-02 criterion is calibrated on nothing

3 calls from 40 contacts is a 7.5% meeting rate from cold email to people the pipeline cannot name. Cold outreach to unnamed contacts at companies that didn't ask typically converts in low single digits; that figure is general knowledge, not measured for this offer. If the real rate is 2%, 40 contacts yields 0–1 calls and the plan's "if not met" branch fires for the wrong reason: it says the list or pitch is wrong, when the arithmetic was. What would make this wrong: warm paths (your network, the current agency's clients) convert far above cold, and the 40 are mostly warm. Evidence: the seed list is 119 strangers and the network block in companies.yaml is empty.

## 3. The source covers a third of the market and most of what it finds is noise

34 of 119 seeds are pollable; 79 have no detectable ATS. Of 301 postings, 102 are engineering titles. One seed, Columbus Global, is an Infor/D365 consultancy and contributed 95 rows; another dozen rows are "Talent Pool", "Candidate Pool", "Initiativbewerbung", "General Application". The claim that ATS feeds are structured and fresh is true; the claim that they reach the buyers is not supported. What would make this wrong: the 200-seed expansion lands on Greenhouse/Lever-heavy US agencies. Evidence against that: only 15 of 59 US seeds are pollable, and no seed uses Lever.

## 4. Fingerprint adapter has no direct buyer

Already established in the second session. A fingerprint is a capability, not a signal. `platform_added` identifies a retailer mid-build with an agency on site, so the lead is the agency, not the retailer. `platform_changed` (go-live, agency rolling off) is the only retailer-facing signal and it fires once per migration, weeks after the hiring decision. Nothing in the Sun 11-09 row produces a contact by 12-02. Evidence for keeping it: none that survives line 1.

## 5. Urgency rewards the postings that mean the least

The rubric gives 10 points for "reposted ≥2 or open >45 days." Evergreen postings ("Freelancer - Berlin", "Engineering Talent Pool", "We are always looking for talented people") are open forever and would score as maximally urgent. Greenhouse also re-dates postings on edit. What would make this wrong: a filter that drops evergreen titles before scoring; none exists. Evidence: at least 12 such rows in the current table.

## 6. Phase 2 signals point at teams that are already solving it

The rubric's top factor is AI tooling named in requirements. Incentro is hiring an "Agentic Engineering Lead"; Vincit an "AI Solution Architect"; Solteq an "AI-Driven Cloud Architect". A company hiring the role in-house is not buying a €3,000 external audit from a stranger. "Pain language" scored from job posts is recruiter copy. Who pays for Phase 2: a CTO with budget and a team stuck at "installed, now what". Where that CTO shows up in public data: nowhere the pipeline looks. Evidence of anyone paying for enablement: one Contra listing at $8,000. Phase 2's kill date is May; this finding doesn't change the plan today, but the pipeline contributes nothing to it.

## 7. US first was decided in a day with no record of why

DECISIONS.md says the owner withdrew the timezone objection. It doesn't say what replaced it. A US agency hiring a non-US contractor typically does it C2C or through a staffing vendor, with 6–9 hours of offset, and the Phase 1 kill date (2027-02-01) spans Thanksgiving to mid-January, when US agencies don't sign new contractors. 15 of 59 US seeds are pollable. What would make this wrong: a US agency that already works with EU contractors and pays in the $85–135/h band the rate research shows. Evidence: none yet; rubric weights were changed before any message was sent.

## 8. Extraction and scoring don't earn their build at this volume

Two runs produced 301 postings as backfill; steady state is new postings per day across 34 companies, likely single digits. A title keyword filter and a human glance handle that. The LLM extraction stage, two rubrics, two eval sets and a weekly drift check are built for 200+ pollable companies. Against the 12-02 criterion they contribute nothing; against the Wed 11-12 row they consume a build day. What would make this wrong: the seed list reaching 200 pollable companies by mid-November. Evidence: 34 pollable after 119 seeded.

## 9. Contact discovery is the actual work and nothing budgets it

Postings never name the hiring manager. The pipeline emits a company and a role; turning that into a person with an email is manual, unscoped, and the spec rules out the only tool that makes it fast (LinkedIn). careers@ addresses don't reply. So the pipeline reduces the finding step, which was cheap, and leaves the naming step, which is the cost. Who pays: nobody until a named person reads the message. Evidence: `Find contact` is a plain search link in the spec; the plan allots no hours.

## 10. Tender awards: no buyer in reach

Who pays: the agency that won. TED awards for "Salesforce" are CRM and case-management, not commerce; UK Contracts Finder frameworks commonly require UK presence or clearance. The agency staffs a won tender from its bench or its existing sub list. Why me instead of them: not answered. Evidence: none; the row exists because the idea was good in the abstract.

## 11. FINA seeds assume a Croatian buyer nobody has met

40 Croatian software companies, 10–50 people, for a €3,000 audit and an €8,000–15,000 rollout. Croatian engineering day rates are a fraction of UK/US, so the price anchor transfers badly. The plan's own truism audit lists this as untested. Evidence of a Croatian company paying for agent enablement: none. The language advantage is real; whether it buys anything is the open question at the bottom.

## 12. Rate band is borrowed from a different seller

€550–650/day comes from UK itjobswatch medians for UK-based Nuxt contractors and US freelance surveys. Neither measures what a UK or US agency pays a remote Croatian B2B contractor. What would make this wrong: your current agency rate is already in that band. Evidence: the one number that would settle it, what you're paid now, isn't in any doc.

## 13. Build order versus the 12-02 criterion

Rows that contribute to "3 calls from 40 contacts": the seed list (done), snapshot + diff as a way to pick which 40 are hiring now (done), Compose. Rows that do not: fingerprint (11-09), extraction + rubric + evals (11-12), Phase 2 rubric (11-15), Telegram bot with buttons (11-15), remaining ATS adapters (11-16), tender adapter (11-24), FINA (12-01). The 12-02 number can be hit today with zero further code: pick 40 from the 34 polled companies plus network, name a person at each, send. Every row after Sat 11-08 was interesting to design and is irrelevant to the first kill date.

## 14. The plan has no branch for losing the current agency before February

Runway is under 3 months if agency work ended. "Second client by 2027-02-01" assumes the first one holds through the holidays. If it ends in December, the plan's Phase 1 branch says widen the search, which takes the same weeks the runway doesn't have. What would make this wrong: a contract with notice terms that cover the gap. Evidence: not in any doc.

## Open questions for the owner (answered 2026-11-03)

Kept for the record. Answers are summarized in the disposition section above.

1. How did the current agency find and hire you? Posting, recruiter, referral, inbound? Did they ever post the role publicly? (Finding 1)
2. What day rate does the current agency pay you, and what do they bill the client? (Finding 12; also sets whether €550–650 is a raise or a cut)
3. When the current agency has overflow, what do they do: bench, offshore, contractor, decline? Have you seen them take a contractor from a cold email? (Findings 1, 9)
4. Why US first? What changed about timezone, and have you contracted for a US company before, under what structure? (Finding 7)
5. Of the 40 you'd contact first, how many are warm: people who know your name or the agency's? (Finding 2)
6. What's your notice period and the agency's, and does the contract have a minimum term? (Finding 14)
7. Do you know any Croatian software company of 10–50 people that has paid an outside consultant for engineering process work, at any price? (Finding 11)
8. How many hours a week are you willing to spend finding named contacts by hand, given LinkedIn is off the table? (Finding 9)
