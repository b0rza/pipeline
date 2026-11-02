# 2027 Income Plan

Nov 2, 2026 · @yossarian

With under 3 months of runway, the plan is cash first: secure a second contracting client by February 2027 at a senior rate, then spend one day a week building toward the one upside bet the data supports, which is helping engineering teams adopt AI coding agents. Everything else you've been circling (Salesforce Loyalty niche, EU e-invoicing, the customs-broker lead-gen engine) is dropped or parked, with reasons below.

## Constraints this is built on

| Constraint | Stated | Consequence |
| --- | --- | --- |
| Runway | Under 3 months if agency work ended | Nothing that pays in 6+ months comes first |
| Employment offer | Nothing concrete | Don't plan around it; take it if it arrives and the contract allows your company |
| Work mode | Open to engineering, selling + delivery, product, automation | No constraint, so the market decides |
| Salesforce | In, no strong objection | Keep as a rate booster inside contracting, not as the niche |
| Track record | 13 years full-stack, team lead, commerce + payments, and a deep working AI coding-agent setup | The last one is the only asset where supply is short right now |

## What the market data says

The 2026 market has split: senior engineers who can direct AI output are paid more, everyone below them is paid less, and the rare skill is making AI agents work inside a real team.

| Finding | Evidence | What it means for you |
| --- | --- | --- |
| Senior rates rising, junior and mid falling | [2026 rate data shows AI competition pushing junior/mid rates down while seniors who can supervise AI output earn more](https://blog.codercops.com/blog/freelance-developer-rates-2026-ai-impact-data); [strong seniors (8+ yrs) are \~13% of contracts and command 17–94% premiums](https://lemon.io/salary-report/) | Price as senior/lead, never as "developer" |
| AI agent adoption is near-universal, competence isn't | [90% of professional developers use coding agents at least weekly; Claude Code workplace adoption went from \~18% in Jan 2026 to 39% by mid-2026](https://blog.jetbrains.com/research/2026/08/18/ai-coding-agent-adoption-2026) | Teams have the tools; making them work is the gap |
| Teams struggle with review and governance, not installation | [When AI produces more code than a developer can review, teams either merge under-reviewed work or queue PRs indefinitely](https://www.saasrise.com/blog/the-agentic-engineering-trends-report-2026); [inconsistent CLAUDE.md files produce inconsistent agent behavior](https://blog.buildbetter.ai/claude-code-for-teams-setup-guide-5-best-alternatives-in-2026/) | Exactly the problems your current setup already solves |
| Enablement is already being sold | [A London freelancer sells "Agentic coding adoption" at $8,000 for 2 weeks](https://contra.com/s/ccoLQkvB-agentic-coding-adoption-claude-code-for-your-dev-team); [advisory engagements run 4–8 weeks](https://articles.firstaimovers.com/articles/fractional-cto-claude-code-advisory-2026/) | Price exists; the market is early, not empty |
| Salesforce Commerce is a weak premium | UK SFCC contract medians run [£334](https://www.itjobswatch.co.uk/contracts/central%20london/salesforce%20commerce%20cloud%20developer.do) to [£550/day](https://www.itjobswatch.co.uk/contracts/uk/salesforce%20commerce%20cloud%20developer.do); US contracts list [$25–85/h](https://signify.sites.sourceflow.co.uk/jobs/Salesforce-Commerce-Cloud-Developer-21083/) | Not a niche; at best a line on the CV |
| Nuxt/commerce lead roles pay decently | UK Nuxt contracts: [median £545/day, e-commerce frontend architect £600–660](https://www.itjobswatch.co.uk/search?j=1&q=Nuxt) | Your cash-floor rate band |

## Phase 1: Cash security (now to February 2027)

Goal: a second client relationship signed by 2027-02-01, so no single agency can end your income. This phase gets 80% of your time and all of your selling energy until it's done.

**What you sell:** senior or lead engineer who owns a commerce storefront end to end, including the integrations most frontend contractors won't touch: checkout, payments, loyalty, CRM/Salesforce sync. Shipped-not-ticketed, with 11 years at one company and a team-lead exit as proof of reliability.

**Who buys:**

- Agencies on the SCAYLE, commercetools and Salesforce Commerce partner lists in the UK, Nordics and Benelux. They have the clients; they lack senior people who can run a storefront without supervision.
- Mid-size retailers with headless storefronts and an in-house team of 3–10, hiring contract to fill a gap.
- Your current agency, kept but as one of two.

**Rate:** €550–650/day. UK Nuxt contract medians support this; the lead/architect framing is what gets the top of the band. Don't go below €500 for anyone except the current agency during transition.

**Salesforce:** mention Loyalty Management, Apex and payment integrations on the CV; they open doors at commerce agencies serving Salesforce clients. Don't pursue the certification unless a specific client asks. The rate premium for Salesforce developers has shrunk and the time is better spent on Phase 2.

**Employment offer:** if it becomes concrete, treat it as Phase 1 solved, provided the contract lets you keep the company and bill Phase 2 work. If it forbids that, the offer costs you the upside bet; price that in.

## Phase 2: AI coding-agent enablement for engineering teams

This is the one bet where you hold something scarce today: a working, hardened agent setup (sandboxed containers, secrets via `op run`, cross-tool AGENTS.md/CLAUDE.md, controlled sub-phases instead of opaque subagents), plus 13 years of knowing what breaks in real teams. Most people selling this have one of the two.

**Why it clears the bar the other niches didn't:**

- Large and growing: 90% of developers use agents weekly, and most teams are at the "installed, now what" stage.
- Barrier is real but held by you: credibility comes from production experience with agents in a team, not from a cert. You can't buy it in a weekend, and you already have it.
- Pays above contracting: comparable offers run $8,000 for two weeks, roughly double your Phase 1 day rate.
- Fits all four work modes you said yes to: engineering, selling + delivery, product (the playbook and tooling become reusable), automation.

**Who buys:** engineering teams of 5–40 that already pay for Claude Code or Cursor and aren't getting the lift. Three sources you can reach fast: the agencies from Phase 1 (same contacts, different offer), their retail clients' in-house teams, and Croatian and regional software companies where you sell in your own language with no Western competitor.

**Offer, three steps:**

1. **Agent readiness audit**, 3 days, €3,000 fixed. Review their repos, CI, review process and current agent usage. Deliver: what's blocking value, the risks they're carrying (secrets, sandboxing, unreviewed merges), a rollout plan.
2. **Rollout**, 2–4 weeks, €8,000–15,000 fixed. Standard AGENTS.md/CLAUDE.md across repos, sandboxed execution, secrets handling, review workflow that scales with agent output, CI integration, two pairing sessions per team.
3. **Retainer**, €1,500–2,500/month. Keep the setup current as tools change monthly; office hours; new-repo onboarding.

**The credibility asset comes first:** publish your actual setup as a written playbook (sandboxing, secrets, config layout, review flow, what failed). Nobody buys this from someone without a public artifact. It also feeds the outbound tooling with something worth sending.

**Window:** this market will fill within 12–24 months; vendors are publishing their own playbooks and every fractional CTO is adding it to their deck. The move is to be early and keep a retainer base, not to build a long-term identity on it.

## Dropped or parked

Four options were on the table. Three go, for reasons that hold regardless of runway.

| Option | Decision | Why |
| --- | --- | --- |
| Salesforce Loyalty Management niche | Dropped | A handful of job posts; learnable by a generalist in weeks; one implementation isn't a track record |
| Customs-broker outbound engine | Dropped as a business; tooling kept | Needs trade-compliance domain knowledge you don't have, no client after 6+ weeks, and every n8n builder pitches the same thing. The sending and enrichment setup gets pointed at Phase 1 and 2 lists instead |
| EU e-invoicing integration | Parked, revisit at the May review | Real mandates, real barrier, but the gap is only on custom B2B stacks after Shopify/Salesforce apps take the easy cases, and you have no proof asset. Becomes attractive only if Phase 2 stalls and Fiskalizacija work lands in your lap locally |
| Salesforce certification | Dropped unless a client requires it | Developer premium has shrunk; architect demand is up but that's a different job and years away |

## First 30 days

By 2026-12-02: 3 agency calls for Phase 1, the playbook published for Phase 2, and the customs engine formally parked.

**Week 1**

- [ ] Write two one-page case studies: the retail storefront + loyalty build, and the Penn payments platform. One number each (members, transactions, team size, timeline).
- [ ] Company website: one page, two sections, Phase 1 offer and Phase 2 offer. No more than a day.
- [ ] Park the customs-broker engine: stop any spend, keep domains and mailboxes for your own outreach.

**Week 2**

- [ ] Phase 1 list: 40 agencies from SCAYLE, commercetools and Salesforce Commerce partner directories (UK, Nordics, Benelux), plus 15 in-house retail teams with headless stacks.
- [ ] Phase 2 playbook, first draft: your setup as it exists, with what failed. Publish on the site by end of week 3.

**Weeks 3–4**

- [ ] Phase 1: 40 direct messages. Target: 3 calls.
- [ ] Phase 2: 15 messages to CTOs/leads at agencies and Croatian software companies, playbook attached, offering the audit. Target: 3 conversations.
- [ ] Day 30 review against the criteria below.

## Review dates and kill criteria

These exist so that future-you can't argue a bet is "almost working."

| Date | Check | If not met |
| --- | --- | --- |
| 2026-12-02 | 3 Phase 1 calls booked from 40 contacts; playbook published | Fewer than 2 calls: the list or pitch is wrong, fix before sending more. No playbook: Phase 2 hasn't started; that's the first problem to solve |
| 2027-02-01 | Second client signed at ≥ €500/day, or employment offer accepted | Widen Phase 1: DACH despite the friction, generic senior full-stack roles, lower floor to €450. Phase 2 drops to zero hours until this is met |
| 2027-05-01 | At least one paid Phase 2 audit | Kill Phase 2 as a service line. Un-park e-invoicing or pick a new upside bet with the same test |
| 2027-09-01 | Phase 2 revenue ≥ 30% of total, or one retainer | Phase 2 is a side income, not a business; stop investing beyond retainer maintenance |

## Truism audit

Two claims carry the plan: that your agent setup is a scarce, sellable asset, and that the enablement market stays open long enough to pay. Both are plausible and neither is proven; the May review tests them.

| Claim | Verdict | Why |
| --- | --- | --- |
| Cash first with under 3 months runway | Obvious, but it reordered everything | Previous versions put the niche first; that was wrong for your situation |
| Senior rates up, junior rates down | Supported by several 2026 sources | All are vendor or marketplace blogs with an interest in the story; direction is consistent across them, magnitude unknown |
| Your agent setup is scarce | Plausible, untested | Competitors with a public playbook and team experience exist (the $8k Contra offer). Yours is better only if the playbook shows depth they don't |
| Enablement pays double contracting | One data point | $8,000 / 2 weeks is one listing by one person; it proves the price is sayable, not that it's paid often |
| 12–24 month window | Guess | Could be shorter if vendors productize governance; could be longer if tools keep changing monthly |
| Agencies as buyers for both phases | Useful | Same contacts, two offers, halves the outreach cost |
| Croatian market for Phase 2 | Untested | Lower rates, but zero Western competition in the local language; worth 5 of the 15 messages |
| Kill criteria | The only part that constrains you | Specific, dated, cheap to check |
