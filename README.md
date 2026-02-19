# PokéBeach News Worker

A Cloudflare Worker that scrapes the PokéBeach homepage every 30 minutes and makes new articles available as:

- **RSS Feed** — Subscribe at `/feed` with any RSS reader
- **Discord Webhooks** — New articles posted as rich embeds to a channel of your choice

Use one or both — the Discord webhook is optional.

Runs entirely on Cloudflare's free tier edge network — no server needed.

## How It Works

1. Cron trigger fires every 30 minutes
2. Worker fetches the PokéBeach homepage
3. Parses article entries (title, URL, author, date, image)
4. Caches parsed articles in KV for the RSS feed
5. If a Discord webhook is configured, posts new articles as rich embeds
6. Tracks posted articles in KV with 30-day TTL (auto-cleanup)

## Quick Start

```text
1. cp wrangler.toml.sample wrangler.toml
2. cp .dev.vars.sample .dev.vars
3. npm install
4. npx wrangler login
5. npx wrangler kv namespace create POSTED_ARTICLES  →  paste ID into wrangler.toml
6. npx wrangler secret put API_KEY  →  choose any secret key for /trigger and /seed endpoints
7. (Optional) npx wrangler secret put DISCORD_WEBHOOK_URL
8. npx wrangler deploy
```

Detailed steps below.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)

## Step 1: Install Dependencies

```bash
cd pokebeach-news-worker
cp wrangler.toml.sample wrangler.toml
cp .dev.vars.sample .dev.vars
npm install
```

Both `wrangler.toml` and `.dev.vars` are gitignored since they contain deployer-specific config and secrets. The `.sample` files are tracked as templates.

## Step 2: Log In to Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

## Step 3: Create the KV Namespace

The worker uses Cloudflare KV to cache articles for the RSS feed and track which articles have been posted to Discord.

```bash
npx wrangler kv namespace create POSTED_ARTICLES
```

The output will look like:

```text
🌀 Creating namespace with title "pokebeach-news-worker-POSTED_ARTICLES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "POSTED_ARTICLES", id = "abc123def456..." }
```

Copy the `id` value and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml`.

## Step 4: Configure Features

### RSS Feed

Disabled by default. To enable the `/feed` endpoint, set in `wrangler.toml`:

```toml
[vars]
RSS_ENABLED = "true"
```

### API Key (Required for Manual Endpoints)

The `/trigger` and `/seed` endpoints require an API key to prevent unauthorized access.

Choose any secret key and store it:

```bash
npx wrangler secret put API_KEY
```

You'll use this key in the `X-API-Key` header when calling these endpoints.

### Discord Webhooks

Optional. If not configured, the worker runs in RSS-only mode.

To enable, create a webhook in Discord:

1. Open Discord and go to the server where you want news posted
2. Go to **Server Settings** → **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Give it a name (e.g. "PokéBeach News") and optionally set an avatar
5. Select the **channel** you want articles posted to
6. Click **Copy Webhook URL**

Store it as a secret in Cloudflare:

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

Paste the webhook URL when prompted. This is stored securely and never appears in your code or config files.

If you skip this step, the worker runs in RSS-only mode — no Discord posts, no errors.

## Step 5: Test Locally (Optional)

Secrets set via `wrangler secret` only exist in Cloudflare's production environment — `wrangler dev` can't access them. For local testing, edit `.dev.vars` and paste your Discord webhook URL (or leave it blank for RSS-only). This file is gitignored.

Start the local dev server:

```bash
npx wrangler dev
```

Test the RSS feed:

```bash
curl http://localhost:8787/feed
```

Trigger the cron handler (fetches articles + posts to Discord if configured):

```bash
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

Or use the manual trigger endpoint (returns JSON with results):

```bash
curl -X POST -H "X-API-Key: your-api-key" http://localhost:8787/trigger
```

## Step 6: Deploy

```bash
npx wrangler deploy
```

On first deploy, Wrangler will prompt you to register a `workers.dev` subdomain (e.g. `my-subdomain`). Your worker will then be accessible at:

```text
https://pokebeach-news-worker.my-subdomain.workers.dev
```

Expected output:

```text
Deployed pokebeach-news-worker triggers
  https://pokebeach-news-worker.my-subdomain.workers.dev
  schedule: */30 * * * *
```

The worker is now live and will run automatically every 30 minutes.

Your RSS feed is at:

```text
https://pokebeach-news-worker.my-subdomain.workers.dev/feed
```

To watch the logs in real time:

```bash
npx wrangler tail
```

## First Deploy Note (Discord Only)

If you have Discord webhooks configured, the next cron run will post all articles currently on the PokéBeach homepage (~17) to Discord. To avoid this initial flood, hit the seed endpoint right after deploying:

```bash
curl -X POST -H "X-API-Key: your-api-key" https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/seed
```

This marks all current articles as "already posted" in KV without sending anything to Discord. Only genuinely new articles will trigger webhooks after that.

This does not affect the RSS feed — the feed always shows all current homepage articles.

## Changing the Schedule

Edit the cron expression in `wrangler.toml`:

```toml
[triggers]
crons = ["*/30 * * * *"]  # every 30 minutes (default)
# crons = ["0 * * * *"]   # every hour
# crons = ["0 */6 * * *"] # every 6 hours
```

Then redeploy: `npx wrangler deploy`

## Free Tier Usage

Everything fits comfortably within Cloudflare's free tier:

| Resource          | This Worker    | Free Limit    |
| ----------------- | -------------- | ------------- |
| Cron invocations  | 48/day         | 100,000/day   |
| CPU time per run  | ~5ms           | 10ms          |
| KV reads          | ~816/day       | 100,000/day   |
| KV writes         | ~10/day        | 1,000/day     |
| Subrequests       | ~6/invocation  | 50/invocation |

## Troubleshooting

### Worker deploys but nothing posts to Discord

- Check that `DISCORD_WEBHOOK_URL` is set: `npx wrangler secret list`
- Check logs for errors: `npx wrangler tail`
- Make sure the webhook hasn't been deleted in Discord

### "Fetch failed: 403" in logs

- PokéBeach may be blocking the request. This is rare from Cloudflare's edge IPs but can happen. Check `npx wrangler tail` for details.

### Duplicate posts appearing

- Make sure the KV namespace ID in `wrangler.toml` matches the one you created. If you recreated the namespace, old dedup data is gone.

### RSS feed returns 502

- The worker couldn't reach PokéBeach. The feed will recover on the next successful cron run.
