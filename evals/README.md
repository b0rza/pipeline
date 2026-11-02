# Evals

One JSONL file per phase, ~50 hand-labeled postings each. `run.ts` re-scores them with the current rubric and fails if more than 10% change band.

Line format:

```json
{"posting_id":"<sha256>","expected_band":"draft","notes":"agency, contract Nuxt role reposted twice","labeled_at":"2026-11-12"}
```

`expected_band` is one of `skip`, `watch`, `draft`, `priority`.

Label from real postings pulled by the snapshot stage, not invented ones. Re-label when a rubric change is intentional; never edit labels to make a run pass.
