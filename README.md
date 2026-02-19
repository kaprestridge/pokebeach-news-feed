# PokéBeach News → Discord Worker

A Cloudflare Worker that scrapes the PokéBeach homepage every 30 minutes and posts new articles to a Discord channel via webhook.

Runs entirely on Cloudflare's free tier edge network — no server needed.

## How It Works

1. Cron trigger fires every 30 minutes
2. Worker fetches the PokéBeach homepage
3. Parses article entries (title, URL, author, date, image)
4. Checks KV store for already-posted articles
5. Posts new articles to Discord as rich embeds (with title, link, author, image, timestamp)
6. Stores posted article keys in KV with 30-day TTL (auto-cleanup)

## Quick Start

```
1. npm install
2. npx wrangler login
3. npx wrangler kv namespace create POSTED_ARTICLES  →  paste ID into wrangler.toml
4. Create Discord webhook  →  npx wrangler secret put DISCORD_WEBHOOK_URL
5. npx wrangler deploy
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

The worker uses Cloudflare KV to remember which articles have already been posted.

```bash
npx wrangler kv namespace create POSTED_ARTICLES
```

The output will look like:

```
🌀 Creating namespace with title "pokebeach-news-worker-POSTED_ARTICLES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "POSTED_ARTICLES", id = "abc123def456..." }
```

Copy the `id` value and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml`.

## Step 4: Create a Discord Webhook

1. Open Discord and go to the server where you want news posted
2. Go to **Server Settings** → **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Give it a name (e.g. "PokéBeach News") and optionally set an avatar
5. Select the **channel** you want articles posted to
6. Click **Copy Webhook URL**

Now store it as a secret in Cloudflare:

```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

Paste the webhook URL when prompted. This is stored securely and never appears in your code or config files.

## Step 5: Test Locally (Optional)

Secrets set via `wrangler secret` only exist in Cloudflare's production environment — `wrangler dev` can't access them. Create a `.dev.vars` file for local testing:

```bash
cp .dev.vars.sample .dev.vars
```

Edit `.dev.vars` and paste your Discord webhook URL. This file is gitignored.

Start the local dev server:

```bash
npx wrangler dev
```

Trigger the cron handler:

```bash
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

Or use the manual trigger endpoint (returns JSON with results):

```bash
curl -X POST http://localhost:8787/trigger
```

Check the terminal output to see how many articles were parsed and posted.

## Step 6: Deploy

```bash
npx wrangler deploy
```

On first deploy, Wrangler will prompt you to register a `workers.dev` subdomain (e.g. `my-subdomain`). Your worker will then be accessible at:

```
https://pokebeach-news-worker.my-subdomain.workers.dev
```

Expected output:

```
Deployed pokebeach-news-worker triggers
  https://pokebeach-news-worker.my-subdomain.workers.dev
  schedule: */30 * * * *
```

The worker is now live and will run automatically every 30 minutes.

To watch the logs in real time:

```bash
npx wrangler tail
```

## First Deploy Note

On first deploy, the next cron run will post all articles currently on the PokéBeach homepage (~17) to Discord. To avoid this initial flood, hit the seed endpoint right after deploying:

```bash
curl -X POST https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev/seed
```

This marks all current articles as "already posted" in KV without sending anything to Discord. Only genuinely new articles will trigger webhooks after that.

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

| Resource | This Worker | Free Limit |
|---|---|---|
| Cron invocations | 48/day | 100,000/day |
| CPU time per run | ~5ms | 10ms |
| KV reads | ~816/day | 100,000/day |
| KV writes | ~10/day | 1,000/day |
| Subrequests | ~6/invocation | 50/invocation |

## Troubleshooting

**Worker deploys but nothing posts to Discord**
- Check that `DISCORD_WEBHOOK_URL` is set: `npx wrangler secret list`
- Check logs for errors: `npx wrangler tail`
- Make sure the webhook hasn't been deleted in Discord

**"Fetch failed: 403" in logs**
- PokéBeach may be blocking the request. This is rare from Cloudflare's edge IPs but can happen. Check `npx wrangler tail` for details.

**Duplicate posts appearing**
- Make sure the KV namespace ID in `wrangler.toml` matches the one you created. If you recreated the namespace, old dedup data is gone.
