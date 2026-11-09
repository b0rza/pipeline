-- Desirable employers on the watch list (2026-11-09): a company is an agency the owner contracts for, or an employer he
-- would work for directly. core/filter.ts routes and keeps an employer's postings by a stricter rule. The employer's
-- research profile stays in universe/companies.yaml.
alter table companies add column kind text not null default 'agency';  -- agency | employer
