// Publishes the PokéBeach RSS feed to GitHub Pages.
//
// PokéBeach sits behind a Cloudflare anti-bot challenge that returns 403 to
// datacenter IPs (like GitHub Actions runners), so we can't scrape it here
// directly. Our Cloudflare Worker runs on Cloudflare's network and *can*
// reach it, and already serves the finished RSS at /feed — so we fetch that
// and republish it to Pages, plus build a small landing page from it.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseItems, compareFeeds } from './feed-items.mjs';

const FEED_SOURCE_URL = process.env.FEED_SOURCE_URL;
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Article URLs the Worker saw when it dispatched this run (JSON array; absent
// on scheduled/manual runs). Worker KV is eventually consistent, so /feed can
// briefly serve the previous list; we wait for it to match before publishing.
const EXPECTED_URLS = JSON.parse(process.env.EXPECTED_URLS || 'null');
const MATCH_ATTEMPTS = 6;
const MATCH_DELAY_MS = 20_000;

async function main() {
	if (!FEED_SOURCE_URL) {
		throw new Error(
			"FEED_SOURCE_URL is not set. Point it at a source serving the PokéBeach RSS " +
			"(e.g. your own deployed Worker's /feed endpoint).",
		);
	}

	const { xml, items } = await fetchSourceFeed();

	// Guard against publishing an empty feed (e.g. the Worker returned an error
	// page) — failing the job preserves the last good deploy.
	if (items.length === 0) {
		throw new Error('Source feed has no items — refusing to publish an empty feed');
	}

	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(join(OUTPUT_DIR, 'feed.xml'), xml, 'utf8');
	await writeFile(join(OUTPUT_DIR, 'index.html'), landingPage(items), 'utf8');

	console.log(`Published feed with ${items.length} items`);
}

async function fetchSourceFeed() {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(FEED_SOURCE_URL);
		if (!response.ok) {
			throw new Error(`Failed to fetch source feed: ${response.status} ${response.statusText}`);
		}
		const xml = await response.text();
		const items = parseItems(xml);

		if (!Array.isArray(EXPECTED_URLS)) return { xml, items };
		// Feed links are XML-escaped by the Worker; escape the raw URLs to match.
		const expected = EXPECTED_URLS.map((url) => ({
			url: url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
		}));
		if (compareFeeds(expected, items).inSync) return { xml, items };

		if (attempt === MATCH_ATTEMPTS) {
			throw new Error('Source feed never matched the dispatched article list — refusing to publish an outdated feed');
		}
		console.log(`Source feed does not match the dispatched article list yet (attempt ${attempt}/${MATCH_ATTEMPTS}), retrying`);
		await sleep(MATCH_DELAY_MS);
	}
}

function landingPage(items) {
	// Titles/links come straight from the RSS and are already XML-escaped; the
	// same entities are valid in HTML, so we insert them as-is (no re-escaping).
	const list = items
		.slice(0, 15)
		.map((a) => `      <li><a href="${a.url}">${a.title}</a></li>`)
		.join('\n');

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PokéBeach News — RSS Feed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; }
    h1 { color: #d4a017; }
    code { background: #f2f2f2; padding: 0.15rem 0.4rem; border-radius: 4px; }
    ul { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>PokéBeach News</h1>
  <p>An unofficial RSS feed of the latest <a href="https://www.pokebeach.com/">PokéBeach</a> news, updated within about 30 minutes of each new post.</p>
  <p>Subscribe in your reader with: <code>feed.xml</code></p>
  <p><a href="feed.xml">→ feed.xml</a></p>
  <h2>Latest headlines</h2>
  <ul>
${list}
  </ul>
</body>
</html>
`;
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
