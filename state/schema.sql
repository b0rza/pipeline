-- Signal pipeline. See docs/SPEC.md "Data model" and docs/SPEC-v2.md.
-- This file is the shape of a fresh DB. Changes to an existing DB go through numbered
-- files in state/migrations/ (applied by core/db.ts); `create table if not exists` won't add columns.
-- Change both together: a fresh DB records every migration as applied without running it.
pragma journal_mode = wal;

create table if not exists schema_migrations (
  name text primary key,                   -- filename in state/migrations/
  applied_at text not null default (datetime('now'))
);

create table if not exists companies (
  id text primary key,
  name text not null,
  domain text,
  country text,
  phases text not null default '["p1"]',   -- json array
  ats_vendor text,
  ats_slug text,
  storefront_url text,
  source text,
  status text not null default 'active',   -- active | paused | watch
  last_contacted text,
  added_at text not null default (datetime('now')),
  consecutive_failures integer not null default 0,
  last_failed_run text,                    -- run_date of the last counted failure
  skip_until text,                         -- set after 3 consecutive feed failures
  warm integer not null default 0          -- 1 = referral path in the network block
);

create table if not exists postings (
  id text primary key,                     -- sha256(company_id || external_id)
  company_id text not null references companies(id),
  external_id text not null,
  url text,
  title text,
  location text,
  body text,
  body_hash text not null,
  body_hash_prev text,
  body_changed_at text,                    -- run_date of the last body edit
  posted_at text,
  first_seen text not null,
  last_seen text not null,
  gone_at text,
  repost_count integer not null default 0,
  reposted_at text,                        -- run_date a gone id last came back
  raw text,                                -- json
  route text,                              -- stage 3: apply | outreach | drop
  route_reason text                        -- keyword that decided it: evergreen, non-engineering, title:contract, body:day rate, perm
);
create index if not exists postings_company on postings(company_id);
create index if not exists postings_gone on postings(gone_at);

-- Stage 2 writes, stages 3 and 5 read.
create table if not exists events (
  id text primary key,                     -- sha256(posting_id || run_date || kind)
  run_date text not null,
  company_id text not null references companies(id),
  posting_id text references postings(id),
  kind text not null,                      -- posting_new | posting_edited | posting_reposted | posting_gone
  created_at text not null default (datetime('now'))
);
create index if not exists events_run on events(run_date);
create index if not exists events_company on events(company_id, run_date);

create table if not exists posting_extracts (
  posting_id text primary key references postings(id),
  body_hash text not null,                 -- extract is valid for this hash only
  extracted_at text not null,
  model text not null,
  fields text not null                     -- json, extract.schema.json
);

create table if not exists fingerprints (
  id text primary key,                     -- sha256(company_id || run_date)
  company_id text not null references companies(id),
  run_date text not null,
  platforms text not null,                 -- json [{platform, confidence, evidence[]}]
  frontend text,                           -- json [{framework, evidence[]}]
  raw_hash text
);
create index if not exists fingerprints_company on fingerprints(company_id, run_date);

create table if not exists signals (
  id text primary key,                     -- sha256(company_id || run_date)
  company_id text not null references companies(id),
  run_date text not null,
  list text not null,                      -- apply | outreach
  kinds text not null,                     -- json array of event kinds
  ref_ids text not null,                   -- json array of posting ids that passed the filter
  status text not null default 'new',      -- new | notified | applied | sent | skipped | snoozed | replied
  skip_reason text,
  snooze_until text,
  sent_body text,
  telegram_message_id text,
  updated_at text not null default (datetime('now'))
);
create index if not exists signals_status on signals(status);
create index if not exists signals_run on signals(run_date);

create table if not exists runs (
  run_date text primary key,
  started_at text not null,
  finished_at text,
  companies_polled integer,
  postings_new integer,
  signals_drafted integer,
  notes text
);
