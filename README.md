# pipeline

Nightly signal pipeline: polls ATS feeds for a seeded company list, diffs, splits what's new into an apply list and an outreach list, writes the record to `out/`, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC-v2.md`.

Start here: `AGENTS.md`, then `docs/SPEC-v2.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/STATUS.md`.

## Glossary

- **Company**: a company on the watch list, one entry in `universe/companies.yaml`. Older docs and commit messages say "seed" for the same thing. Each company has a kind: an agency or an employer.
- **Agency**: a company the owner would contract for, through his own company. Every company on the list was an agency until 2026-11-09, and an entry without a `kind` is one.
- **Employer**: a company on the watch list the owner would work for directly, as opposed to an agency he would contract for. These are product companies such as Stripe, n8n or Supabase, marked `kind: employer` with an `employer:` research profile (group, bar, why, remote policy, engagement). The filter sends every engineering posting of an employer to the `apply` list and keeps only the ones that are remote and open to Croatia, or that are in Croatia. Its signal says `employer` after the list name on the overview page and in `out/`. In Telegram all employer signals of a night share one overview message (see "Digest" below).
- **Board**: that company's job page at a hiring vendor such as Teamtailor or Workable. A company is "pollable" when the pipeline has an adapter that can read its board.
- **Posting**: one job ad read from a board. A row in the `postings` table.
- **Event**: one change seen on one night: a posting is new, edited, reposted or gone. A row in the `events` table.
- **Signal**: one company on one night, bundling its postings that passed the filter. A row in the `signals` table, at most one per company per run. It sits on the `apply` list (a contract job, or an employer's job, to apply to) or the `outreach` list (a company to write to).
- **Digest**: the night's Telegram messages: a header, one message per agency signal, and one overview message for all employer signals. The same content, with every employer posting listed, is written to `out/YYYY-MM-DD/`.

```
npm install
RUN_DATE=$(date +%F) ./scripts/run-nightly.sh
```

Node 22.13 or newer (the database is `node:sqlite`). Without Telegram configured the script prints the digest at the end instead of sending it.

## Secrets

Two environment variables: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The nightly script sources `~/.config/pipeline/env` when it exists (override the path with `PIPELINE_ENV_FILE`); a deployment host such as Coolify sets them on the service instead. Values never go in a file inside this repo.

```
mkdir -p ~/.config/pipeline
printf 'TELEGRAM_BOT_TOKEN=...\nTELEGRAM_CHAT_ID=...\n' > ~/.config/pipeline/env
chmod 600 ~/.config/pipeline/env
```

`npm run bot` runs the button handler as a long-running process with the same two variables. `TELEGRAM_DRY_RUN=1 npm run notify` prints the digest instead of sending it.

## Digest

The nightly digest is a series of Telegram messages to your own chat.

1. **The header.** `Digest 2026-11-10 · 3 apply · 5 outreach · 6 employers · 120 dropped postings`. Apply and outreach count agency signals only. Employers counts the employer signals.
2. **One message per agency signal.** Each lists the company's postings and carries the buttons Applied (or Compose for outreach), Skip, Snooze 7d and Later.
3. **One overview message for all employer signals.** One line per company: the name, where the work may be done, a `contract` or `b2b` mark when a posting says so, the number of postings, and up to three posting titles as links, the rest as `+N`. Where the work may be done is the best of the company's postings, in this order: Croatia (shown as 🇭🇷), `europe`, `emea`, `global`, `unstated` (remote, no place named). Companies are ordered the same way, then warm first, then by name.

The overview has no per-company buttons. You act on employer signals on the overview page, Pending tab (see "Overview page" below), with the same Applied, Skip, Snooze 7d, Later and Reopen as for agencies. A signal you reopen there is back in the next night's overview. When `PIPELINE_UI_URL` is set to the page's address, the overview carries one `Open dashboard` button that opens the Pending tab. Without it, or with a value that is not an http(s) address, the overview has no button and the log gets a `notify: WARNING` line saying so.

Telegram caps a message at 4096 characters. If the overview is too long, it first drops to one title per company. If that is still too long, it is split at company boundaries into several messages headed `Employers 2026-11-10 (1/3)` and so on, with the button under the last one. `out/YYYY-MM-DD/summary.md` lists the employers under their own heading in the same order, with every posting.

## Running on Coolify

One container does everything. Its main process (`npm run serve`, `scripts/serve.ts`) runs the Telegram button handler and the overview page together. Coolify runs the nightly script inside the same container as a scheduled task, so all three use one database. The database and the nightly record files live on one storage volume at `/data`, which survives redeploys. The server does not commit to git (`PIPELINE_NO_COMMIT=1` is set in the image).

1. **Make the git copy of the database current.** On first start the container copies `state/pipeline.sqlite` from the image, which is the git copy, to `/data/pipeline.sqlite`. Before the first deploy, stop `npm run bot` and any nightly run on the Mac, run `npm run checkpoint`, commit `state/pipeline.sqlite` and push. A stale copy would send signals again that were already sent.
2. **Create the application.** Private repository `b0rza/pipeline`, branch `master`, build pack Dockerfile. No domain, no port mapping, and "Ports Exposes" left empty, which Coolify's docs allow for a bot. The image has no health check.
3. **Add storage.** Persistent Storage, Volume Mount, destination path `/data`. It must be a volume mount: the container runs as the `node` user, and a directory mount from the host would belong to root.
4. **Set the variables.** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TZ=Europe/Zagreb`. The run date comes from the container clock, which is UTC without `TZ`. Optional: `PIPELINE_UI_URL`, the address of the overview page, for example `https://pipeline.<tailnet>.ts.net`. It puts an `Open dashboard` button under the employer overview message. It is not a secret, but it differs per deployment, so it is set here and not in a file. Without it the message has no button. The address is known once Tailscale runs (below).
5. **Deploy and read the log.** It shows `entrypoint: database seeded from the image at /data/pipeline.sqlite`, then `bot: listening for callbacks from chat ...`. Later deploys show `entrypoint: using the existing database`.
6. **Add the scheduled task.** Command `/app/scripts/run-nightly.sh`, frequency for example `0 6 * * *`. Coolify reads the time in the server's configured timezone. Press Execute Now once to test.
7. **Keep the volume.** Leave Coolify's "Delete Unused Volumes" cleanup off. If `/data` is ever lost, the next start seeds from the git copy again, which by then is old.

Only one process may poll Telegram for a bot, so the bot on the Mac must stay stopped once the server runs. The overview page runs in the container but listens only on the container's own loopback, so nothing outside can reach it yet. It has no login, so never give the application a domain or a port mapping: Coolify's docs warn that a published port bypasses the server firewall. The page is reached over Tailscale, set up below. A backup of `/data` needs `pipeline.sqlite` together with its `-wal` and `-shm` files, or `npm run -s checkpoint` run in the container first.

### The overview page over Tailscale

The container can join your Tailscale network as its own device. Tailscale then forwards an HTTPS address inside that network to the page. Nothing is opened on the server, so the page stays unreachable from the internet. It is off until `TS_AUTHKEY` is set.

1. **Enable HTTPS in Tailscale.** Admin console, DNS page: turn on MagicDNS and HTTPS Certificates. Without them the forward cannot get a certificate.
2. **Create an auth key.** Admin console, Settings, Keys. One-time, not ephemeral. Tick pre-approved if your network requires device approval.
3. **Set `TS_AUTHKEY` in Coolify and redeploy.** Optional: `TS_HOSTNAME`, the device name, default `pipeline`. Leave `TS_AUTHKEY` set afterwards: Tailscale starts only when the variable is present, although the key itself is used for the first login only.
4. **Read the log.** It shows `tailscale: logged in as device pipeline, ...` and `tailscale: the page is at https://pipeline.<your-network>.ts.net/ (tailnet only)`.
5. **Set `PIPELINE_UI_URL` to that address in Coolify and redeploy.** For example `https://pipeline.<your-network>.ts.net`. The employer overview in Telegram then has an `Open dashboard` button to the Pending tab. With it unset the message has no button. The button works only on a device that has Tailscale on, like the page itself.
6. **Turn off key expiry for the device.** Admin console, Machines, the `pipeline` device, Disable key expiry. Otherwise it drops off the network after 180 days.
7. **Open the address** from a phone or laptop that has Tailscale on.

If Tailscale fails to start, the log shows a `tailscale: WARNING` line with the reason, and the bot and the nightly run carry on. The device identity lives in `/data/tailscale` on the volume. Do not set `PIPELINE_UI_HOST`, a domain or a port mapping for this, and never use Tailscale Funnel, which is its public-internet feature.

## Overview page

`npm run ui` serves http://127.0.0.1:8787/ (set `PIPELINE_UI_PORT` for another port, and `PIPELINE_UI_HOST` for another listen address, private networks only). Four tabs: Pending is what waits on you (what tonight's digest would send, plus what it sent that has no answer yet), apply first and B2B apply signals first within it; Later is what you tabled with the Later button, with no date, which the nightly never re-sends or retires; History is every other signal by run date, with its status; Employers lists every employer on the watch list, read-only. The Employers tab groups them as the research did (payments and fintech, commerce platforms, commerce-adjacent, developer tools and AI, remote-first Europe), and within a group by bar (reach, fit, stretch) and then name. Each employer shows its careers page, country, bar, whether its remote policy covers Europe, why it is on the list, what its remote policy says with the source, and a board line from the database: the board vendor (or "not read" when the pipeline has no adapter for it), then the live postings, how many of them are engineering and how many the filter kept, and when a posting was last seen, or "not polled yet". The profile is read from `universe/companies.yaml` on each page load, so the tab is filled before the first nightly. Cards carry the same buttons as Telegram (Applied, Skip with a reason, Snooze 7d, Later, Compose as a `mailto:` link) plus Reopen, and write the same statuses. Skip is a dropdown of the reasons, and choosing one skips the signal. The tab bar stays pinned while you scroll and ends with the light / dark switch, a card with more than five postings shows the first five and folds the rest under "N more", and on a phone the header is one line, the tabs and each card's buttons fit one row (Snooze 7d reads Snooze) and a posting's tag sits under its title. After a button press the page opens on Pending; after Reopen it opens at the reopened card. It listens on loopback by default and has no login: it is a desk view, not something to put on the open internet. A button press that another website sends is refused (the `Origin` or `Sec-Fetch-Site` header must say same site). Styling is Pico CSS v2.0.6 (classless, MIT), vendored in `ui/` and served by the page itself, so nothing loads from the network.
