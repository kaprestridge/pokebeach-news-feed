// Health check for the published RSS feed.
//
// The Pages feed is rebuilt only when the Worker sees new articles, so its age
// says nothing about health. This compares the published feed with the
// Worker's /feed and fails (emailing us) when Pages is missing articles or
// carries ones the source has dropped. A mismatch is rechecked once after a
// delay so an in-flight publish or the Pages CDN cache does not cause a false
// alarm.
//
// Usage: FEED_URL=<pages feed> FEED_SOURCE_URL=<worker feed> node scripts/check-feed.mjs

import { setTimeout as sleep } from 'node:timers/promises';
import { parseItems, compareFeeds } from './feed-items.mjs';

const { FEED_URL, FEED_SOURCE_URL } = process.env;
const RECHECK_DELAY_SECONDS = Number(process.env.RECHECK_DELAY_SECONDS ?? 900);

function fail(message) {
	console.error(message);
	process.exit(1);
}

// Labels keep the source URL (a secret) out of error messages.
async function fetchItems(url, label) {
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) fail(`${label} returned ${response.status} ${response.statusText}`);
	return parseItems(await response.text());
}

async function check() {
	const published = await fetchItems(`${FEED_URL}?t=${Date.now()}`, 'Published feed');
	const source = await fetchItems(FEED_SOURCE_URL, 'Source feed');
	console.log(`Published items: ${published.length}, source items: ${source.length}`);
	if (published.length < 1) fail('Published feed has no <item> entries');
	if (source.length < 1) fail('Source feed has no <item> entries — the Worker may be failing to scrape PokéBeach');
	return compareFeeds(source, published);
}

if (!FEED_URL || !FEED_SOURCE_URL) fail('FEED_URL and FEED_SOURCE_URL must both be set');

let result = await check();
if (!result.inSync) {
	console.log(`Feeds differ (${result.missing.length} missing, ${result.extra.length} extra); rechecking in ${RECHECK_DELAY_SECONDS}s`);
	await sleep(RECHECK_DELAY_SECONDS * 1000);
	result = await check();
}

if (!result.inSync) {
	for (const url of result.missing) console.error(`Missing from Pages: ${url}`);
	for (const url of result.extra) console.error(`On Pages but dropped from source: ${url}`);
	fail('Published feed is behind the source — the Worker dispatch or publish workflow may be failing');
}

console.log('Feed is healthy.');
