-- The owner could not tell a quiet night (0 signals, nothing sent) from a nightly that never ran: nothing recorded how
-- a run went. Each stage now writes its counts to the run's row, scripts/run-nightly.sh records the end or the failed
-- stage (core/runs.ts), and the overview page shows the newest row as its last-run line.
alter table runs add column boards_ok integer;           -- stage 1: boards read
alter table runs add column boards_failed integer;       -- stage 1: boards whose request failed
alter table runs add column failed_boards text;          -- stage 1: json [{id, reason}], reason the error's first line
alter table runs add column postings_gone integer;       -- stage 2: posting_gone events
alter table runs add column signals integer;             -- stage 3: apply + outreach signals
alter table runs add column messages_sent integer;       -- stage 7: Telegram messages sent; null in a dry run
alter table runs add column error text;                  -- `stage 1-2: <last error line>` when the nightly failed
