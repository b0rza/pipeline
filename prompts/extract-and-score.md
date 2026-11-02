You are running inside the `pipeline` repo. Read AGENTS.md first.

Task for this run (date in $RUN_DATE):
1. Read `rubrics/phase1.md` and `rubrics/phase2.md`.
2. Query `state/pipeline.sqlite` for postings with `first_seen = $RUN_DATE` or whose `body_hash` differs from `posting_extracts.body_hash`, joined to companies with status != 'paused'.
3. For each, write one `posting_extracts` row conforming to `core/extract.schema.json`.
4. Score each posting per its company's phases. Collapse to one `signals` row per company per phase: best score, all event kinds, all posting ids, three reasons.
5. For signals with score >= 60, write `draft_subject` and `draft_body` using the templates in `assets/` for that phase. One message per company; mention every relevant posting.
6. Write `out/$RUN_DATE/{phase}-{company_id}.md` per drafted signal and `out/$RUN_DATE/summary.md`.

You have no network access. Do not attempt to fetch anything. If a posting body is empty, mark it `skip` with reason "no body" and move on.
