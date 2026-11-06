# One container for Coolify: the main process (scripts/serve.ts) runs the Telegram button handler and the overview
# page together, and Coolify runs /app/scripts/run-nightly.sh inside it as a scheduled task. All use the database on
# the volume at /data. The page listens on the container's loopback on port 8787 unless PIPELINE_UI_HOST is set on the
# service; it has no login, so it must only ever be reachable over a private network.
# No secrets in the image: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set on the Coolify service.
FROM node:26-slim

WORKDIR /app

# devDependencies included: the code runs with node --import tsx.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# /data is the volume: the database and the nightly record files. A fresh named volume mounted there takes this
# directory's owner. out/ is written relative to the repo root, so it points into the volume.
RUN mkdir -p /data/out /app/logs \
 && ln -s /data/out /app/out \
 && chown node:node /data /data/out /app/logs

ENV PIPELINE_DB=/data/pipeline.sqlite \
    PIPELINE_NO_COMMIT=1

USER node

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "--import", "tsx", "scripts/serve.ts"]
