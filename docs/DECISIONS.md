# Decisions

Decisions made before this repo existed, with the reason. Read before proposing an architecture change; most of these have already been argued once. Date format: YYYY-MM-DD.

## Strategy (2026-11-02)

- **Cash first.** Runway is under 3 months if current agency work ended. Nothing that pays in 6+ months comes before a second contracting client. See PLAN.md.
- **Two phases, not two niches.** Phase 1 is generalist contracting (commerce storefront lead) and needs no moat, only pipeline. Phase 2 is the upside bet (AI coding-agent enablement) and needs a moat. They share buyers (agencies) and tooling (this repo), nothing else a prospect can see.
- **Phase 2 is agent enablement, not Salesforce Loyalty or e-invoicing.** Loyalty: a handful of job posts, learnable by a generalist in weeks. E-invoicing: real mandates, but the gap is only on custom B2B stacks after Shopify/Salesforce apps cover the easy cases, and no proof asset exists. Agent enablement is the one area where a scarce asset is already held (hardened production setup: sandboxing, `op run` secrets, cross-tool AGENTS.md, controlled sub-phases).
- **Customs-broker outbound engine dropped as a business.** No domain knowledge, no client after 6+ weeks, commodity offer. Its sending infrastructure (Instantly, outreach domains) is reused here.
- **Kill dates are binding.** 2026-12-02, 2027-02-01, 2027-05-01, 2027-09-01, criteria in PLAN.md. Don't relitigate at the date; check the number.

## Pipeline (2026-11-02)

- **Automate sensing and drafting, never sending.** Final send stays human for at least v1 and v2. Reputation on the sending domain is not an expendable asset. Automated send is v3 at the earliest, after 100+ reviewed drafts.
- **Sources: ATS feeds and storefront fingerprinting, not job boards or GitHub.** ATS per-company JSON feeds are structured, fresh, legal and under-polled by individuals. GitHub org signals were rejected: most relevant repos are private. Job boards and LinkedIn are rejected: ToS risk on the account being sold from, and recruiters have already rewritten the posting.
- **One signal per company per run.** Three postings at one company produce one signal and one draft that mentions all three. Prevents double-contacting; halves review volume.
- **Telegram digest with buttons, not a PR.** A PR was the first design. Rejected because with manual sending, merge triggers nothing, so the PR was a recording device with ceremony. Statuses in `signals` plus optional `sent_body` capture the same data. A PR becomes right only when merge means send (v3). Telegram wins on the nudge: you won't miss a 07:00 message.
- **Buttons do everything up to the send button.** Compose (`mailto:` prefilled), Instantly (lead + draft attached, nothing launched), Rewrite, Snooze, Skip with reason. Skip reasons feed rubric tuning.
- **Evals before trust.** 50 hand-labeled postings per phase. Rubric edits must pass evals before commit. Skipping this is how LLM scorers rot silently.
- **The model never touches the network.** Fetching is deterministic code in stages 1–2. Headless Claude Code runs with `--allowedTools "Read,Write,Bash(sqlite3:*)"` and only reads SQLite and writes markdown.
- **SQLite committed to the repo.** Small, and history is useful. Revisit if it passes ~50 MB.
- **TypeScript on Node.** Fastest to maintain for this owner. Playwright only in `fingerprint/`, only where plain HTTP fails.
- **Builder's trap rule.** After 2026-11-16, every feature needs a number from the review to justify it. Sent messages are the only metric. If the pipeline consumes more than the protected day (1/week), it's a hobby.

## Open, deliberately

- Whether Phase 2's agent setup is deeper than what competitors already sell (one Contra listing at $8,000/2 weeks exists). The published playbook tests this.
- Whether the Croatian market pays for Phase 2 at all. 5 of the first 15 Phase 2 messages go there.
- Exact ATS endpoint patterns and SCAYLE fingerprint hosts. Written from memory in SPEC.md; verify against live sites before building on them.
