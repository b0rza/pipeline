Real feed responses, trimmed to 2 entries with long text fields truncated (meta.total in greenhouse.json is the untrimmed count).

- greenhouse.json: Greenhouse, slug `getyourguide`, fetched 2026-11-02 from https://boards-api.greenhouse.io/v1/boards/getyourguide/jobs?content=true
- lever.json: Lever, slug `emma-sleep`, fetched 2026-11-02 from https://api.lever.co/v0/postings/emma-sleep?mode=json
- personio.xml: Personio, slug `eshop-guide`, fetched 2026-11-02 from https://eshop-guide.jobs.personio.de/xml
- teamtailor.json: Teamtailor, custom-domain board `careers.columbusglobal.com`, fetched 2026-11-02 from https://careers.columbusglobal.com/jobs.json
- jazzhr-list.html: JazzHR, slug `concordusa`, fetched 2026-11-02 from https://concordusa.applytojob.com/apply, cut to the jobs-list block with 2 of 19 items
- jazzhr-job.html: JazzHR job page, fetched 2026-11-02 from https://concordusa.applytojob.com/apply/pecO9wzTZE/Salesforce-Commerce-Cloud-SFCC-ArchitectLead, cut to the `<title>` and ld+json blocks
- jazzhr-pool.html: JazzHR open-application page (no JobPosting), fetched 2026-11-02 from https://classyllama.applytojob.com/apply/swMdqwV0MY/Candidate-Pool, cut to the `<title>`, Organization ld+json and description div
- bamboohr-list.json, bamboohr-detail.json: BambooHR, slug `sherocommerce`, fetched 2026-11-02 from https://sherocommerce.bamboohr.com/careers/list and /careers/60/detail (detail without `formFields`)
- breezy.json: Breezy, slug `thirdandgrove`, fetched 2026-11-02 from https://thirdandgrove.breezy.hr/json?verbose=true, 2 of 3 positions
- rippling-list.json, rippling-job.json: Rippling, slug `verndale-llc`, fetched 2026-11-02 from https://api.rippling.com/platform/api/ats/v1/board/verndale-llc/jobs (rows for 2 of 6 jobs) and /jobs/d240587d-9b8d-48df-af24-d744a3e48eef (without `activeJobApplication` and `board`)
- workable.json: Workable, slug `tryzensglobal`, fetched 2026-11-04 from https://apply.workable.com/api/v1/widget/accounts/tryzensglobal?details=true, 3 of 10 rows: both location rows of 082DFE38B2 and the Contract job C3939D0217
- recruitee.json: Recruitee, slug `youwe`, fetched 2026-11-04 from https://youwe.recruitee.com/api/offers/, 2 of 8 offers (one without `requirements`, one with)
- smartrecruiters-list.json, smartrecruiters-detail.json: SmartRecruiters, slug `smartrecruiters`, fetched 2026-11-04 from https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings?limit=100&offset=0 (untrimmed, 2 postings) and /postings/744000158320111
- ashby.json: Ashby, slug `ashby`, fetched 2026-11-04 from https://api.ashbyhq.com/posting-api/job-board/ashby?includeCompensation=true, 3 of 71 jobs with `secondaryLocations` and compensation tiers cut to the first few; the third job's `isListed` was set to false by hand, since the live board had no unlisted job
- zoho.xml: Zoho Recruit, slug `ziffity/Ziffity-Job-Opening`, fetched 2026-11-04 from https://ziffity.zohorecruit.com/jobs/Ziffity-Job-Opening/rss. The feed had one item; the second item ("Inside Sales - APAC", with a Location and a PST date) was built by hand from the second job in the careers page's embedded JSON, in the same shape
