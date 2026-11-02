# Signal Pipeline v1 Spec

Nov 2, 2026 · @yossarian

v1 is a nightly job that polls ATS feeds and fingerprints storefronts for a seeded list of companies, diffs against yesterday, extracts and scores what's new, and sends you a Telegram digest with one drafted message per company. You review and press send. Target: first diff running by 2026-11-09, first digest by 2026-11-16.

## Scope

**In v1**

- Two source adapters: ATS feeds (\~100 companies) and storefront fingerprinting (\~200 retailers)
- Snapshot → diff → extract → score → Telegram digest, nightly
- Phase 1 and Phase 2 rubrics, one eval set each
- Runs headless in your sandboxed container on the Coolify box

**Not in v1**

- Sending. The bot prepares everything up to the send button; you press it. Automated send is v3 at the earliest, after 100+ reviewed drafts.
- Tender awards, FINA, recruiter dedupe, agency-page diffs. Each is one adapter added later; the architecture doesn't change.
- Contact discovery. v1 names the company and the role; finding the person is manual until the reply data says which companies deserve the effort.
- A web UI. Telegram messages with buttons are the UI; the repo is the record.
- LinkedIn, Indeed or Glassdoor in any form.

## Repo layout

One repo, `pipeline`. Code and state live together so the agent and you read the same thing. SQLite is committed nightly; it's small and the history is useful.

```
pipeline/
  AGENTS.md              # how the agent behaves in this repo (tools, limits, output format)
  universe/
    companies.yaml       # seed list: name, domain, country, phase tags, ats {vendor, slug}, storefront {url}
  adapters/
    ats/{greenhouse,lever,ashby,workable,smartrecruiters,personio,recruitee,teamtailor}.ts
    fingerprint/storefront.ts
    fingerprint/signatures.yaml
  core/
    snapshot.ts          # fetch → normalize → hash → store
    diff.ts              # new / changed / gone since last run
    extract.ts           # LLM → structured fields (schema in extract.schema.json)
    score.ts             # rubric per phase → 0–100 + reasons
    group.ts             # postings → one signal per company per run
    draft.ts             # one message per signal, from templates + case studies
  bot/
    notify.ts            # builds and sends the Telegram digest
    server.ts            # HTTP endpoint for button callbacks → updates signals.status
    actions.ts           # compose (mailto), skip, rewrite, snooze
  rubrics/
    phase1.md            # ICP rubric, human-readable, the LLM reads it
    phase2.md
  evals/
    phase1.jsonl         # ~50 labeled postings: {posting_id, expected_score_band, notes}
    phase2.jsonl
    run.ts               # re-score eval set, report drift
  assets/
    case-study-retail.md
    case-study-penn.md
    playbook-agents.md   # Phase 2 credibility asset, linked in drafts
  out/
    YYYY-MM-DD/          # one folder per run, one file per signal (= per company); the record
      p1-{company}.md
      p2-{company}.md
      summary.md
  state/
    pipeline.sqlite
  scripts/
    run-nightly.sh
```

TypeScript on Node, since that's what you'll maintain fastest. Playwright only inside `fingerprint/` and only for sites that need JS to render.

## Data model

Five tables. Everything is keyed by a content hash so re-runs are idempotent.

```sql
create table companies (
  id text primary key,            -- slug
  name text, domain text, country text,
  phases text,                    -- json array: ["p1","p2"]
  ats_vendor text, ats_slug text,
  storefront_url text,
  source text,                    -- where the seed came from
  added_at text
);

create table postings (
  id text primary key,            -- sha256(company_id + external_id)
  company_id text references companies(id),
  external_id text, url text, title text, location text,
  body_hash text,                 -- detects edits
  first_seen text, last_seen text, gone_at text,
  raw json
);

create table posting_extracts (
  posting_id text primary key references postings(id),
  extracted_at text, model text,
  fields json                     -- extract.schema.json
);

create table fingerprints (
  id text primary key,            -- sha256(company_id + run_date)
  company_id text, run_date text,
  platforms json,                 -- [{"platform":"sfcc","evidence":[...]}]
  frontend json,                  -- [{"framework":"nuxt"}]
  raw_hash text
);

-- one row per company per run that produced anything worth acting on
create table signals (
  id text primary key,            -- sha256(company_id + run_date)
  company_id text, run_date text, phase text,
  kinds json,                     -- ["posting_new","posting_reposted","platform_added"]
  ref_ids json,                   -- posting ids and/or fingerprint ids behind it
  score int, reasons json,
  draft_subject text, draft_body text,
  status text,                    -- new | notified | sent | skipped | snoozed | replied
  skip_reason text, snooze_until text,
  sent_body text,                 -- what you actually sent, if you paste it back
  telegram_message_id text
);
```

`signals` is the only table the bot reads and the only one it writes to. Everything upstream exists to populate it.

## Adapter 1: ATS feeds

Each vendor exposes a per-company public feed built for job aggregators. Detect the vendor from the careers-page URL or its redirect, store the slug, poll the feed. Verify each pattern against two live companies before trusting it; vendors change endpoints.

| Vendor | Where common | Detect from careers URL | Feed |
| --- | --- | --- | --- |
| Greenhouse | US, UK startups and agencies | `boards.greenhouse.io/{slug}`, `job-boards.greenhouse.io` | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` (JSON, full body) |
| Lever | US, UK | `jobs.lever.co/{slug}` | `https://api.lever.co/v0/postings/{slug}?mode=json` |
| Ashby | Startups | `jobs.ashbyhq.com/{slug}` | `https://api.ashbyhq.com/posting-api/job-board/{slug}` |
| Workable | UK, EU SMEs | `apply.workable.com/{slug}` | `https://apply.workable.com/api/v3/accounts/{slug}/jobs` (POST, JSON) |
| SmartRecruiters | EU enterprise | `jobs.smartrecruiters.com/{Company}` | `https://api.smartrecruiters.com/v1/companies/{Company}/postings` |
| Personio | DACH, CEE SMEs | `{slug}.jobs.personio.de` | `https://{slug}.jobs.personio.de/xml` (XML) |
| Recruitee | NL, Belgium | `{slug}.recruitee.com` | `https://{slug}.recruitee.com/api/offers/` |
| Teamtailor | Nordics | `{slug}.teamtailor.com` or custom domain with Teamtailor assets | Public API needs a key; fall back to HTML list + per-job fetch |
| Custom | Larger retailers | Anything else | Playwright, last resort; cap at 20 companies in v1 |

**Normalization:** every feed maps to `postings` with `external_id`, `title`, `location`, `url`, `body` (HTML stripped to text), `posted_at` if present. Hash the body; a changed hash on a known id is an edit, which is itself a signal (salary band added, "contract" added, seniority raised).

**Repost detection:** a posting that goes `gone` and a near-identical one appears within 14 days at the same company is a repost. Count reposts; two or more means they can't fill it.

## Adapter 2: Storefront fingerprinting

Fetch homepage and one product URL per retailer, plus response headers and set-cookies. For sites that render client-side, fall back to Playwright and capture the network request hosts. Match against the signature table; store the platforms and evidence; diff weekly.

| Platform | Signatures (any two = confident, one = probable) |
| --- | --- |
| SFCC (SiteGenesis / SFRA) | `/on/demandware.store/` or `/on/demandware.static/` in HTML; cookies `dwsid`, `dwanalytics`, `dwac_*`; `demandware.net` in asset or CDN hosts |
| SFCC headless (PWA Kit) | `/mobify/bundle/` paths; network calls to `*.commercecloud.salesforce.com` (SCAPI/OCAPI); `kv*.demandware.net` |
| commercetools | Network calls to `api.{region}.commercetools.com` or `auth.{region}.commercetools.com`; usually paired with a Next/Nuxt frontend |
| SCAYLE | Storefront API host under `*.scayle.cloud`; CDN hosts under `aboutyou.cloud` / `aboutstatic.com`. You work on this daily; confirm the exact hosts from a current client's network tab |
| Shopify | `cdn.shopify.com`; `/cart.js`; header `x-shopid` or `x-shopify-stage`; `Shopify.theme` JS global |
| Adobe Commerce / Magento | `/static/version{n}/`; `Magento_` in script names; cookie `mage-cache-sessid`; `/rest/V1/` |
| Shopware | `/widgets/` routes; header `sw-context-token`; `shopware` meta generator |
| BigCommerce | `cdn11.bigcommerce.com` |
| Frontend (orthogonal) | `/_nuxt/` → Nuxt; `/_next/` → Next.js; `/mobify/` → PWA Kit |

**Signals produced:**

- `platform_changed`: confident platform A last week, confident platform B this week. Migration done; they're in stabilization, often still hiring.
- `platform_added`: A on the main domain, B on a subdomain or in network calls. Migration in progress. The highest-value signal in this adapter.
- `frontend_changed`: same platform, new frontend framework. Headless rebuild underway.

False positives to handle: third-party widgets (reviews, chat) that load from Shopify or Salesforce domains; marketing subdomains on a different stack by design. Require evidence on the commerce paths (cart, product) not just any page.

## Universe seeding

The pipeline is only as good as `companies.yaml`. Seed \~300 in the first week from sources that already encode intent.

| Source | Yields | Phase | How |
| --- | --- | --- | --- |
| commercetools and Salesforce Commerce partner directories, Clutch, Shopify Plus / BigCommerce agency lists | \~80 US agencies | P1, P2 | Scrape once; prefer boards on Greenhouse or Lever |
| SCAYLE, commercetools, Salesforce Commerce partner directories | \~100 agencies in UK, Nordics, Benelux, DACH | P1, P2 | Scrape once; store name, domain, listed region and tier |
| Clutch / Sortlist, e-commerce development, 10–50 staff, target countries | \~50 agencies not in partner lists | P1, P2 | Scrape once |
| Top retailers by country (Internet Retailing UK Top500, Twinkl/Emerce NL lists, Ehandel Nordics, Croatian: Trgovina lists) | \~200 retailers | P1 | Scrape once, keep domains |
| Your own network: past clients, the current agency's clients, Studion alumni companies | \~20 | P1, P2 | Manual; highest reply rate of any source |
| Croatian software companies (FINA RGFI export, NKD 62.01, 10–50 employees, revenue growth) | \~40 | P2 | Export once in week 4; manual careers-URL lookup |

**Resolution step:** for each company, find the careers URL (common paths: `/careers`, `/jobs`, `/join`, `/karijere`, `/karriere`, `/vacatures`, `/lediga-jobb`), follow redirects, detect the ATS vendor from the final host. Record `unknown` rather than guessing; unknowns go to the Playwright adapter or get skipped.

A seed row:

```yaml
- id: acme-digital
  name: Acme Digital
  domain: acmedigital.co.uk
  country: GB
  phases: [p1, p2]
  source: commercetools-partners
  ats: { vendor: greenhouse, slug: acmedigital }
  storefront: null
```

## Daily run

Seven stages, run as one shell script at 05:00 Europe/Zagreb so the digest is on your phone when you wake up. Stages 1–3 are plain code. Stages 4–6 call the model. Stage 7 is git plus Telegram.

1. **Snapshot**: for each company, pull ATS feed (daily) and fingerprint (Mondays only, or daily for companies flagged `watch`). Normalize, hash, upsert into `postings` / `fingerprints`.
2. **Diff**: compare with previous run → per-posting and per-company events: `posting_new`, `posting_edited`, `posting_reposted`, `posting_gone`, `platform_changed`, `platform_added`, `frontend_changed`.
3. **Filter**: drop obvious noise before spending tokens: non-engineering titles, countries outside scope, companies marked `paused`, companies contacted in the last 60 days.
4. **Extract**: for each new or edited posting, LLM fills `extract.schema.json`. Cache by `body_hash`; an unchanged body is never re-extracted.
5. **Score and group**: score each posting against the rubric, then collapse to one `signals` row per company: the best score, all kinds, all posting ids. Three Acme postings become one Acme signal. Signals under 60 are stored but not drafted.
6. **Draft**: for signals ≥ 60, one message per company that references every relevant posting. Templates per phase and signal kind, with case-study or playbook links injected.
7. **Publish**: write `out/YYYY-MM-DD/` (one file per signal, plus `summary.md`), commit to `main`, then send the Telegram digest: one header message, then one message per signal with buttons. Set `status = notified`.

**Headless invocation** for stages 4–6, from inside your sandboxed container:

```bash
claude -p "$(cat prompts/extract-and-score.md)" \
  --output-format json \
  --allowedTools "Read,Write,Bash(sqlite3:*)" \
  --max-turns 40
```

Secrets via `op run`, as you already do. The prompt file tells the agent to read `rubrics/`, `assets/`, the day's `signals` rows, and write `out/`. `AGENTS.md` in the repo forbids network calls from the agent itself; all fetching happened in stages 1–2, so the model never touches a live site.

**Cron:**

```
0 5 * * *   cd /srv/pipeline && ./scripts/run-nightly.sh >> logs/$(date +%F).log 2>&1
0 6 * * 0   cd /srv/pipeline && ./evals/run.ts >> logs/evals-$(date +%F).log 2>&1
```

If you'd rather it run when the box is down, the same script runs as a cloud scheduled task; the only change is where the repo lives.

## Extraction, scoring, evals

**Extraction schema** (`extract.schema.json`), one object per posting:

```json
{
  "role_family": "frontend | fullstack | backend | platform | lead | architect | other",
  "seniority": "junior | mid | senior | lead | principal",
  "engagement": "perm | contract | freelance | unclear",
  "remote": "remote | hybrid | onsite | unclear",
  "stack": ["nuxt", "vue", "typescript", "scayle", "commercetools", "sfcc", "apex"],
  "domain": ["ecommerce", "retail", "loyalty", "payments"],
  "ai_tooling_mentions": ["claude code", "cursor", "copilot", "agentic"],
  "rate_or_salary": {"min": null, "max": null, "currency": null, "period": null},
  "end_client_hints": "free text: who the work is really for, if this is a recruiter or agency post",
  "pain_quotes": ["verbatim phrases describing the problem they're hiring to solve"],
  "days_open": 0
}
```

**Phase 1 rubric** (`rubrics/phase1.md`), scored by the model from extracted fields:

| Factor | Points | Rule |
| --- | --- | --- |
| Engagement | 25 | contract/freelance 25; unclear 10; perm 0 unless company is an agency (then 10) |
| Stack overlap | 25 | Nuxt/Vue 10, commerce platform you know 10, TypeScript 5 |
| Seniority | 15 | senior/lead/architect 15; mid 5; junior 0 |
| Domain | 15 | ecommerce/retail 10, loyalty or payments +5 |
| Geography | 10 | US 10; UK/Nordics/Benelux/HR 7; DACH 3 (freelance/B2B bureaucracy); other 0 |
| Urgency | 10 | reposted ≥2 times or open >45 days 10; open >21 days 5 |

**Phase 2 rubric** (`rubrics/phase2.md`):

| Factor | Points | Rule |
| --- | --- | --- |
| AI tooling named in requirements | 30 | any mention 20; two or more tools, or "agentic" 30 |
| Pain language | 25 | review bottleneck, velocity, quality, onboarding, platform/DX role 25; none 0 |
| Team size proxy | 20 | 3+ open eng roles, or a DX/platform role 20; 1–2 roles 10 |
| Geography and language | 15 | HR 15; UK/Nordics/Benelux 10; other EU 5 |
| Company type | 10 | agency 10 (sells capacity, cares about velocity); product company 7; enterprise 3 |

**Eval set**: before trusting either rubric, hand-label 50 real postings per phase into bands (`skip <40`, `watch 40–59`, `draft 60–79`, `priority ≥80`). `evals/run.ts` re-scores weekly and fails loudly if more than 10% move bands. Every rubric edit must pass evals before it's committed. This is the part most people skip, and it's why their scorers rot.

## Output: Telegram digest with buttons

The bot does everything up to the send button. You decide and press it. The repo keeps the record; Telegram is the interface.

**Terms used here**

- **Run**: one execution of the nightly script. Monday 05:00 is one run.
- **Posting**: one advertised role at one company.
- **Signal**: one company per run with something worth acting on. Acme's three new postings are one signal and one message; Beta Retail's platform migration is one signal with no posting behind it.

**The digest**, sent at 07:00 after each run:

1. Header message: `Signals Mon 17 Nov — 7 drafted (2 priority), 11 watch, 1 platform change (Beta Retail: SFCC → commercetools in progress). Evals: pass.`
2. One message per drafted signal, best score first:

```
🟢 82 · P1 · Acme Digital (GB, agency, commercetools partner)
Reposted 3× over 52 days: Senior Frontend (Nuxt), contract
Also new: Vue Developer (perm)

Subject: Nuxt lead for the loyalty storefront role

Hi {name}, saw the senior Nuxt role has been open a while. I've shipped
exactly that shape of work: a national retailer's storefront with a
loyalty programme integrated end to end (tiers, points, vouchers),
Nuxt/TypeScript, delivered solo. Case study: {link}.
Available from {date}, €{rate}/day, UK hours. Worth a 20-minute call?

[Compose ✉️] [Rewrite ✍️] [Snooze 7d] [Skip]
[Posting] [Company] [Find contact]
```

**Buttons** (callbacks hit `bot/server.ts`, which updates `signals`):

| Button | What happens | Status |
| --- | --- | --- |
| Compose | Opens a `mailto:` with subject and body pre-filled in your mail client; you press send there | `sent` after you confirm in a follow-up tap |
| Rewrite | You reply with an instruction ("shorter, mention Penn"); the model returns a new draft in the thread with the same buttons | unchanged |
| Snooze 7d | Hides it, resurfaces in the digest a week later | `snoozed` |
| Skip | Reason picker: bad fit / wrong timing / already contacted / other; stored for rubric tuning | `skipped` |
| Posting, Company, Find contact | Plain links: the ATS posting, the company site, a search for the likely contact | unchanged |

**What the repo holds**, for every run: `out/YYYY-MM-DD/{phase}-{company}.md` with the signal, evidence and draft exactly as sent to Telegram, plus `summary.md`. Commits go straight to `main`. If you paste what you actually sent back (`pipe mark <id> sent --body`), the diff against the draft is stored in `sent_body`.

**Why not a PR**: with manual sending, merge triggers nothing, so a PR is a recording device with extra ceremony. The statuses and `sent_body` capture the same data. A PR becomes the right tool only when merge means send, which is v3 at the earliest.

**What stays manual, on purpose**: the final send, and finding the contact when the posting doesn't name one.

## Build order

Two weekends plus the Phase 2 weekdays. A working diff by the first Sunday, a digest on your phone by the second. Features after that only on the protected day.

| By | Ship | Done when |
| --- | --- | --- |
| Sat 2026-11-08 | Repo, SQLite schema, `companies.yaml` with 60 seeds (partner directories + your network), Greenhouse + Lever + Personio adapters, snapshot + diff | `run-nightly.sh` prints new postings for 60 companies two runs in a row |
| Sun 2026-11-09 | Fingerprint adapter with SFCC, Shopify, commercetools, SCAYLE, Nuxt/Next signatures; 50 retailers | Platforms detected correctly for 10 retailers you already know the answer for |
| Wed 2026-11-12 | Extraction + Phase 1 rubric + 50-posting eval set | Eval run passes; you agree with the band on 45/50 |
| Sat 2026-11-15 | Grouping per company, drafting, Telegram digest with working buttons; Phase 2 rubric + eval set | First real digest on your phone with ≥5 drafts; Compose and Skip buttons work |
| Sun 2026-11-16 | Remaining ATS adapters (Workable, Recruitee, SmartRecruiters, Ashby); seeds to 200 | Nightly run covers 200 companies under 10 minutes |
| Week of 11-17 | Send the first 10 approved messages by hand. Nothing new built this week | 10 sent |
| Week of 11-24 | Tender-award adapter (TED, Contracts Finder) | First award signal drafted |
| Week of 12-01 | FINA export → 40 Croatian P2 seeds; day-30 review | Review done against the plan's criteria |

If 11-15 slips, cut Phase 2 rubric and the Rewrite button to the following week, not the digest. The digest with Compose is the product; a pipeline that never sends one has shipped nothing.

## Guardrails

**Rate limits.** One request per second per host, exponential backoff on 429 and 5xx, 24-hour skip after three consecutive failures per company. Identify with a real User-Agent that names your company and a contact URL. ATS feeds are built for polling; storefronts are not, so fingerprint weekly, not daily.

**Legal.** ATS feeds are public and intended for aggregation. Fetching public storefront pages at low volume is ordinary web access. Respect `robots.txt` on the Playwright path. No logins, no LinkedIn, no Indeed/Glassdoor, no bypassing bot protection; if a site blocks you, mark it and move on. GDPR: v1 stores company data and posting text, no personal data; when contacts arrive in v2, store only name, role and business email, with a documented legitimate-interest basis and deletion on request.

**Model cost.** Extraction is cached by body hash, so steady state is \~20–50 new postings a day. Use the cheapest model that passes evals for extraction; the bigger model only for drafting. Budget under €30/month.

**Agent safety.** The headless run gets no network tools. Fetching is deterministic code in stages 1–2; the model only reads the database and writes markdown. `AGENTS.md` states this and the allowed-tools flag enforces it. Container as you already run it.

**The builder's trap.** Every feature after 11-16 must be justified by a number from the review: reply rate by signal kind, time spent per digest, drafts you rewrote heavily. If the pipeline consumes more than the protected day, it's a hobby. Sent messages are the only metric that counts.
