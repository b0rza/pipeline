-- DECISIONS.md "Work arrangements the owner will take (2026-11-04)": stage 3 drops postings by location.
alter table postings add column work_mode text;                   -- stage 3: remote | hybrid | onsite | unknown
alter table postings add column work_country text;                -- stage 3: ISO 3166-1 alpha-2, null when unread
