-- SPEC-v2 build row 1: stage 3 routes each posting to apply | outreach | drop.
alter table postings add column route text;                       -- apply | outreach | drop
alter table postings add column route_reason text;                -- keyword that decided it: evergreen, non-engineering, title:contract, body:day rate, perm
alter table companies add column warm integer not null default 0;

-- v1 signals carried score, reasons and drafts; v2 defers scoring and drafting. The table was empty when this ran.
drop table if exists signals;
create table signals (
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
