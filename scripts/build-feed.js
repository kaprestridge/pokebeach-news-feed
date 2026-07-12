// Generates a static RSS feed for publishing via GitHub Pages.
// Reuses the same parsing/RSS logic as the Cloudflare Worker (src/index.js)
// so there is a single source of truth for how PokéBeach is scraped.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticles, buildRssXml } from '../src/index.js';

const NEWS_SOURCE_URL = process.env.NEWS_SOURCE_URL || 'https://www.pokebeach.com/';
const USER_AGENT = 'PokeBeachNewsBot/1.0 (RSS feed; +https://github.com/kaprestridge/pokebeach-news-feed)';
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function main() {
	const response = await fetch(NEWS_SOURCE_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${NEWS_SOURCE_URL}: ${response.status} ${response.statusText}`);
	}

	const html = await response.text();
	const articles = parseArticles(html);

	// Guard against publishing an empty feed if the upstream markup changes and
	// parsing silently returns nothing — failing the job preserves the last good deploy.
	if (articles.length === 0) {
		throw new Error('Parsed 0 articles — refusing to publish an empty feed');
	}

	const xml = buildRssXml(articles);

	await mkdir(OUTPUT_DIR, { recursive: true });
	await writeFile(join(OUTPUT_DIR, 'feed.xml'), xml, 'utf8');
	await writeFile(join(OUTPUT_DIR, 'index.html'), landingPage(articles), 'utf8');

	console.log(`Wrote feed.xml with ${articles.length} articles`);
}

function landingPage(articles) {
	const esc = (str) => str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

	const list = articles
		.slice(0, 15)
		.map((a) => `      <li><a href="${esc(a.url)}">${esc(a.title)}</a></li>`)
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
  <p>An unofficial RSS feed of the latest <a href="https://www.pokebeach.com/">PokéBeach</a> news, rebuilt every 30 minutes.</p>
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
