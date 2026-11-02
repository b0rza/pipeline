# Conversation summary

How PLAN.md, SPEC.md and DECISIONS.md came to be. Context for the human, not required reading for the agent. One session, 2026-11-02, ~2.5 hours.

## Arc

1. **Opening question:** "How do I make money in 2027 when code is cheap?" First answers were fluent truisms (accountability, distribution, own the client relationship). Called out as padding. Two rounds of pushback before anything specific appeared.

2. **First plan: Salesforce Loyalty niche.** Built on memory of a shipped Loyalty Management integration. A whole doc was written before noticing that the research had found only a handful of Loyalty job posts and that generalists learn it in weeks. Dropped on challenge.

3. **Second plan: two bets.** The user proposed running a generalist bet and a niche bet in parallel instead of choosing one. Adopted. The niche became EU e-invoicing integration for B2B commerce (mandates live in Belgium, Croatia, Poland, France; Germany 2027). Weakness: the gap only exists on custom stacks once Shopify/Salesforce apps cover the easy cases, and there was no proof asset.

4. **Model switch to Fable, full redo.** Four questions changed the plan more than any research: runway under 3 months, employment offer not concrete, open to all work modes, Salesforce acceptable. Result: cash first, then one upside bet. Market data showed senior rates rising while junior/mid fall, 90% of developers on coding agents weekly, enablement being sold at ~$8k/2 weeks, Salesforce Commerce rates weak. Upside bet became AI coding-agent enablement for engineering teams, the one area where the user already holds a scarce asset.

5. **Pipeline design.** User asked how to build a daily automated loop. First proposal: sensing + drafting pipeline with git PR as approval queue. User challenged GitHub as a source (most repos private) and the PR mechanics (merge triggers nothing, so what's the point). Both conceded. Sources moved to ATS feeds and storefront fingerprinting; output moved to a Telegram digest with action buttons. Signals grouped per company per run after a terminology confusion (run vs posting vs signal).

6. **Handoff.** Two docs exported; this repo scaffolded with the decisions written down so a fresh Claude Code session doesn't relitigate them.

## What the user pushed back on, and was right about

- Truisms dressed as insight ("own the pipeline of buyers captures the margin").
- Anchoring on a niche from memory without checking its size.
- Presenting niche vs generalist as a forced choice.
- GitHub org activity as a signal.
- PR-as-approval when nothing is automated on merge.

## What held up

- Kill criteria with dates.
- Truism audit tables in each doc version.
- ATS feeds and fingerprinting as sources.
- Manual send as a hard line.

## Memory context that fed this

Based in Split. 13 years full-stack JS, team lead at Studion until 2024, now contracting: lead engineer on a web3 platform since Jul 2024 and SCAYLE/Nuxt storefronts via an agency since Jan 2025. Shipped Salesforce Loyalty Management end to end plus storefront; earlier led a Penn course-sales platform with Chargent/Cybersource payments. Maintains a hardened AI coding-agent setup (sandboxed containers, `op run`, AGENTS.md/CLAUDE.md, controlled sub-phases). Had been building an n8n outbound engine for US customs brokers with Instantly and dedicated outreach domains; no client yet. Croatian company with broad registered activities. Runs Node sites on a self-hosted Coolify box.
