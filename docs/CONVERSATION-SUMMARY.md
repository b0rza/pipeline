# Conversation summary

How PLAN.md, SPEC.md and DECISIONS.md came to be. Context for the human, not required reading for the agent. One session, 2026-11-02, ~2.5 hours.

## Arc

1. **Opening question:** "How do I make money in 2027 when code is cheap?" First answers were fluent truisms (accountability, distribution, own the client relationship). Called out as padding. Two rounds of pushback before anything specific appeared.

2. **First plan: Salesforce Loyalty niche.** Built on memory of a shipped Loyalty Management integration. A whole doc was written before noticing that the research had found only a handful of Loyalty job posts and that generalists learn it in weeks. Dropped on challenge.

3. **Second plan: two bets.** The user proposed running a generalist bet and a niche bet in parallel instead of choosing one. Adopted. The niche became EU e-invoicing integration for B2B commerce (mandates live in Belgium, Croatia, Poland, France; Germany 2027). Weakness: the gap only exists on custom stacks once Shopify/Salesforce apps cover the easy cases, and there was no proof asset.

4. **Model switch to Fable, full redo.** Four questions changed the plan more than any research: runway under 3 months, employment offer not concrete, open to all work modes, Salesforce acceptable. Result: cash first, then one upside bet. Market data showed senior rates rising while junior/mid fall, 90% of developers on coding agents weekly, enablement being sold at ~$8k/2 weeks, Salesforce Commerce rates weak. Upside bet became AI coding-agent enablement for engineering teams, the one area where the user already holds a scarce asset.

5. **Pipeline design.** User asked how to build a daily automated loop. First proposal: sensing + drafting pipeline with git PR as approval queue. User challenged GitHub as a source (most repos private) and the PR mechanics (merge triggers nothing, so what's the point). Both conceded. Sources moved to ATS feeds and storefront fingerprinting; output moved to a Telegram digest with action buttons. Signals grouped per company per run after a terminology confusion (run vs posting vs signal).

6. **Challenge pass (2026-11-02 evening).** Owner asked the author to break the three docs from the buyer's side. 14 findings in CHALLENGE.md; the top three questioned whether agencies hire contractors from postings, whether the 12-02 target was calibrated, and whether ATS feeds cover the market.

7. **Reframe (2026-11-03).** Owner's answers: first contract by referral; €55/h hourly, wants fixed-price added not swapped; agency fills overflow by referral; US first for rates and bureaucracy; contract stable, no runway pressure; LinkedIn lookups by hand are fine. Owner corrected three errors in the author's reasoning: generalizing from two data points to the market; treating cold email as the hinge when public contract postings are a mechanism too; and an either-or habit across the whole plan. New frame: additive income streams, nothing replaced, review dates as beacons. PLAN.md rewritten around it; SPEC-v2.md supersedes SPEC.md with a build list ordered by option-widening; CHALLENGE.md carries a disposition per finding.

8. **Handoff.** Two docs exported; this repo scaffolded with the decisions written down so a fresh Claude Code session doesn't relitigate them.

## What the user pushed back on, and was right about

- Truisms dressed as insight ("own the pipeline of buyers captures the margin").
- Anchoring on a niche from memory without checking its size.
- Presenting niche vs generalist as a forced choice.
- GitHub org activity as a signal.
- PR-as-approval when nothing is automated on merge.
- Generalizing from the owner's one hire to the whole market.
- Cold email as the only mechanism; apply-to-posting and referral are mechanisms too.
- Either-or framing everywhere: niche vs generalist, cash vs upside, hourly vs fixed.

## What held up

- Kill criteria with dates.
- Truism audit tables in each doc version.
- ATS feeds and fingerprinting as sources.
- Manual send as a hard line.

## Memory context that fed this

Based in Split. 13 years full-stack JS, team lead at Studion until 2024, now contracting: lead engineer on a web3 platform since Jul 2024 and SCAYLE/Nuxt storefronts via an agency since Jan 2025. Shipped Salesforce Loyalty Management end to end plus storefront; earlier led a Penn course-sales platform with Chargent/Cybersource payments. Maintains a hardened AI coding-agent setup (sandboxed containers, `op run`, AGENTS.md/CLAUDE.md, controlled sub-phases). Had been building an n8n outbound engine for US customs brokers with a cold-email tool and dedicated outreach domains; no client yet. Croatian company with broad registered activities. Runs Node sites on a self-hosted Coolify box.
