# pipeline

Nightly signal pipeline: polls ATS feeds for a seeded company list, diffs, splits what's new into an apply list and an outreach list, writes the record to `out/`, and sends a Telegram digest with action buttons. The owner sends. See `docs/SPEC-v2.md`.

Start here: `AGENTS.md`, then `docs/SPEC-v2.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/STATUS.md`.

## Glossary

- **Company**: a company on the watch list, one entry in `universe/companies.yaml`. Older docs and commit messages say "seed" for the same thing.
- **Board**: that company's job page at a hiring vendor such as Teamtailor or Workable. A company is "pollable" when the pipeline has an adapter that can read its board.
- **Posting**: one job ad read from a board. A row in the `postings` table.
- **Event**: one change seen on one night: a posting is new, edited, reposted or gone. A row in the `events` table.
- **Signal**: one company on one night, bundling its postings that passed the filter. A row in the `signals` table, at most one per company per run. It sits on the `apply` list (a contract job to apply to) or the `outreach` list (a company to write to).
- **Digest**: the night's Telegram messages, a header plus one message per signal. The same content is written to `out/YYYY-MM-DD/`.

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

## Running on Coolify

One container does both jobs. Its main process is the Telegram button handler. Coolify runs the nightly script inside the same container as a scheduled task, so both use one database. The database and the nightly record files live on one storage volume at `/data`, which survives redeploys. The server does not commit to git (`PIPELINE_NO_COMMIT=1` is set in the image).

1. **Make the git copy of the database current.** On first start the container copies `state/pipeline.sqlite` from the image, which is the git copy, to `/data/pipeline.sqlite`. Before the first deploy, stop `npm run bot` and any nightly run on the Mac, run `npm run checkpoint`, commit `state/pipeline.sqlite` and push. A stale copy would send signals again that were already sent.
2. **Create the application.** Private repository `b0rza/pipeline`, branch `main`, build pack Dockerfile. No domain. The bot listens on no port and the image has no health check.
3. **Add storage.** Persistent Storage, Volume Mount, destination path `/data`. It must be a volume mount: the container runs as the `node` user, and a directory mount from the host would belong to root.
4. **Set the variables.** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TZ=Europe/Zagreb`. The run date comes from the container clock, which is UTC without `TZ`.
5. **Deploy and read the log.** It shows `entrypoint: database seeded from the image at /data/pipeline.sqlite`, then `bot: listening for callbacks from chat ...`. Later deploys show `entrypoint: using the existing database`.
6. **Add the scheduled task.** Command `/app/scripts/run-nightly.sh`, frequency for example `0 6 * * *`. Coolify reads the time in the server's configured timezone. Press Execute Now once to test.
7. **Keep the volume.** Leave Coolify's "Delete Unused Volumes" cleanup off. If `/data` is ever lost, the next start seeds from the git copy again, which by then is old.

Only one process may poll Telegram for a bot, so the bot on the Mac must stay stopped once the server runs. The overview page is not served from the container: it has no login. A backup of `/data` needs `pipeline.sqlite` together with its `-wal` and `-shm` files, or `npm run -s checkpoint` run in the container first.

## Overview page

`npm run ui` serves http://127.0.0.1:8787/ (set `PIPELINE_UI_PORT` for another port). The top section is what tonight's digest would send, apply first; below it is every other signal by run date, with its status. Cards carry the same buttons as Telegram (Applied, Skip with a reason, Snooze 7d, Compose as a `mailto:` link) plus Reopen, and write the same statuses. It listens on loopback only and has no login: it is a desk view, not something to expose. Styling is Pico CSS v2.0.6 (classless, MIT), vendored in `ui/` and served by the page itself, so nothing loads from the network.
