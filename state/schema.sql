-- Signal pipeline v1. See docs/SPEC.md "Data model".
pragma journal_mode = wal;

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
  added_at text not null default (datetime('now'))
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
  posted_at text,
  first_seen text not null,
  last_seen text not null,
  gone_at text,
  repost_count integer not null default 0,
  raw text                                 -- json
);
create index if not exists postings_company on postings(company_id);
create index if not exists postings_gone on postings(gone_at);

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
  phase text not null,                     -- p1 | p2
  kinds text not null,                     -- json array of event kinds
  ref_ids text not null,                   -- json array of posting/fingerprint ids
  score integer not null,
  reasons text not null,                   -- json array of strings
  draft_subject text,
  draft_body text,
  status text not null default 'new',      -- new | notified | sent | skipped | snoozed | replied
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
