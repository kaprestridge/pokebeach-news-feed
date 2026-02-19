import { parse } from 'node-html-parser';

const EMBED_COLOR = 0xFFCB05; // Pokemon yellow
const KV_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const FEED_CACHE_KEY = 'rss:feed-cache';
const FEED_CACHE_TTL = 30 * 60; // 30 min, matches cron interval
const POST_DELAY_MS = 1000;
const USER_AGENT = 'PokeBeachNewsBot/1.0 (Discord news feed; +https://github.com/kaprestridge/Poke-discord-bot)';

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(checkForNews(env));
	},

	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('PokéBeach News Worker is running.', { status: 200 });
		}

		if (url.pathname === '/trigger' && request.method === 'POST') {
			const result = await checkForNews(env);
			return Response.json(result);
		}

		if (url.pathname === '/seed' && request.method === 'POST') {
			const result = await seedExistingArticles(env);
			return Response.json(result);
		}

		if (url.pathname === '/feed' && request.method === 'GET') {
			if (env.RSS_ENABLED === 'false') {
				return new Response('RSS feed is disabled', { status: 404 });
			}
			return serveFeed(env);
		}

		return new Response('Not found', { status: 404 });
	},
};

async function checkForNews(env) {
	const response = await fetch(env.NEWS_SOURCE_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		console.error(`Failed to fetch PokéBeach: ${response.status} ${response.statusText}`);
		return { error: `Fetch failed: ${response.status}`, posted: 0 };
	}

	const html = await response.text();
	const articles = parseArticles(html);
	const rssEnabled = env.RSS_ENABLED === 'true';
	const discordEnabled = !!env.DISCORD_WEBHOOK_URL;

	console.log(`Parsed ${articles.length} articles from homepage (RSS: ${rssEnabled ? 'on' : 'off'}, Discord: ${discordEnabled ? 'on' : 'off'})`);

	// Cache parsed articles for the RSS feed
	if (rssEnabled) {
		await env.POSTED_ARTICLES.put(FEED_CACHE_KEY, JSON.stringify(articles), {
			expirationTtl: FEED_CACHE_TTL,
		});
	}

	// Skip Discord posting if no webhook is configured
	if (!discordEnabled) {
		return { parsed: articles.length, new: 0, posted: 0 };
	}

	const newArticles = [];
	for (const article of articles) {
		const key = `article:${article.url}`;
		const existing = await env.POSTED_ARTICLES.get(key);
		if (!existing) {
			newArticles.push(article);
		}
	}

	console.log(`${newArticles.length} new articles to post`);

	// Post oldest first so they appear in chronological order in Discord
	newArticles.reverse();

	let posted = 0;
	for (const article of newArticles) {
		const success = await postToDiscord(env, article);
		if (success) {
			const key = `article:${article.url}`;
			await env.POSTED_ARTICLES.put(key, JSON.stringify({
				title: article.title,
				postedAt: new Date().toISOString(),
			}), { expirationTtl: KV_TTL });
			posted++;
		}

		// Rate limit: wait between posts to avoid Discord webhook throttling
		if (posted < newArticles.length) {
			await sleep(POST_DELAY_MS);
		}
	}

	console.log(`Posted ${posted} new articles to Discord`);
	return { parsed: articles.length, new: newArticles.length, posted };
}

async function seedExistingArticles(env) {
	const response = await fetch(env.NEWS_SOURCE_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		return { error: `Fetch failed: ${response.status}`, seeded: 0 };
	}

	const html = await response.text();
	const articles = parseArticles(html);

	let seeded = 0;
	for (const article of articles) {
		const key = `article:${article.url}`;
		await env.POSTED_ARTICLES.put(key, JSON.stringify({
			title: article.title,
			postedAt: new Date().toISOString(),
			seeded: true,
		}), { expirationTtl: KV_TTL });
		seeded++;
	}

	console.log(`Seeded ${seeded} articles into KV (no Discord posts)`);
	return { parsed: articles.length, seeded };
}

function parseArticles(html) {
	// node-html-parser can't resolve <article> tags in PokéBeach's full HTML
	// (malformed markup upstream breaks the parse tree), so we extract each
	// <article>…</article> block via regex and parse them individually.
	const articleBlocks = html.match(/<article[^>]*>[\s\S]*?<\/article>/g) || [];
	const articles = [];

	for (const block of articleBlocks) {
		try {
			const article = extractArticle(block);
			if (article) {
				articles.push(article);
			}
		} catch (err) {
			console.error('Failed to parse article element:', err.message);
		}
	}

	return articles;
}

function extractArticle(block) {
	const el = parse(block).querySelector('article');
	if (!el) return null;

	// Title + URL from h2.entry-title > a
	const titleLink = el.querySelector('h2 a');
	if (!titleLink) return null;

	const title = titleLink.textContent.trim();
	let url = titleLink.getAttribute('href');
	if (!url) return null;

	// Ensure absolute URL
	if (url.startsWith('/')) {
		url = `https://www.pokebeach.com${url}`;
	}

	// Author from a.article__author
	const authorLink = el.querySelector('a.article__author');
	const author = authorLink ? authorLink.textContent.trim() : null;

	// Date — in <ul class="entry-meta"> list items, look for one with a year
	let dateText = null;
	let timestamp = null;
	const metaItems = el.querySelectorAll('ul.entry-meta li');
	for (const li of metaItems) {
		const text = li.textContent.trim();
		const dateMatch = text.match(/(?:Posted on\s*)?(\w+ \d{1,2}, \d{4}\s+at\s+\d{1,2}:\d{2}\s*[AP]M)/i);
		if (dateMatch) {
			dateText = dateMatch[1].trim();
			timestamp = parseDate(dateText);
			break;
		}
	}

	// Hero image from .xpress_articleImage--full img
	const img = el.querySelector('.xpress_articleImage--full img');
	const image = img ? img.getAttribute('src') : null;

	return { title, url, author, dateText, timestamp, image };
}

function parseDate(dateText) {
	// Input: "Feb 17, 2026 at 2:15 AM"
	// Remove "at " to get a parseable string
	const cleaned = dateText.replace(/\s+at\s+/i, ' ');
	const date = new Date(cleaned);
	return isNaN(date.getTime()) ? null : date.toISOString();
}

async function postToDiscord(env, article) {
	if (!env.DISCORD_WEBHOOK_URL) {
		return false;
	}

	const embed = {
		title: article.title,
		url: article.url,
		color: EMBED_COLOR,
		footer: { text: 'PokéBeach' },
	};

	if (article.author) {
		embed.author = { name: article.author };
	}

	if (article.image) {
		embed.image = { url: article.image };
	}

	if (article.timestamp) {
		embed.timestamp = article.timestamp;
	}

	const body = { embeds: [embed] };

	const response = await fetch(env.DISCORD_WEBHOOK_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`Discord webhook failed (${response.status}): ${text}`);
		return false;
	}

	console.log(`Posted: ${article.title}`);
	return true;
}

async function serveFeed(env) {
	// Try cached articles first
	const cached = await env.POSTED_ARTICLES.get(FEED_CACHE_KEY);
	if (cached) {
		const articles = JSON.parse(cached);
		return new Response(buildRssXml(articles), {
			headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
		});
	}

	// No cache yet (worker just deployed) — fetch fresh
	const response = await fetch(env.NEWS_SOURCE_URL, {
		headers: { 'User-Agent': USER_AGENT },
	});

	if (!response.ok) {
		return new Response('Failed to fetch articles', { status: 502 });
	}

	const html = await response.text();
	const articles = parseArticles(html);

	await env.POSTED_ARTICLES.put(FEED_CACHE_KEY, JSON.stringify(articles), {
		expirationTtl: FEED_CACHE_TTL,
	});

	return new Response(buildRssXml(articles), {
		headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
	});
}

function buildRssXml(articles) {
	const escXml = (str) => str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

	const items = articles.map((a) => {
		const pubDate = a.timestamp ? new Date(a.timestamp).toUTCString() : '';
		return `    <item>
      <title>${escXml(a.title)}</title>
      <link>${escXml(a.url)}</link>
      <guid>${escXml(a.url)}</guid>
${pubDate ? `      <pubDate>${pubDate}</pubDate>\n` : ''}${a.author ? `      <dc:creator>${escXml(a.author)}</dc:creator>\n` : ''}${a.image ? `      <media:thumbnail url="${escXml(a.image)}" />\n` : ''}    </item>`;
	}).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>PokéBeach News</title>
    <link>https://www.pokebeach.com/</link>
    <description>Latest news from PokéBeach - The Largest Pokemon TCG Community</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
