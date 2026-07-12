// Health check for the published RSS feed.
//
// Validates that the feed has at least one article and was built recently,
// then exits non-zero (failing CI, which emails us) on any problem. Uses the
// same string-matching approach as the RSS tests — no XML dependency needed.
//
// Usage: MAX_AGE_HOURS=6 node scripts/check-feed.mjs feed-live.xml

import { readFileSync } from 'node:fs';

const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS ?? 6);
const path = process.argv[2] ?? 'feed-live.xml';

function fail(message) {
	console.error(message);
	process.exit(1);
}

const xml = readFileSync(path, 'utf8');

const items = (xml.match(/<item>/g) || []).length;
console.log(`Items: ${items}`);
if (items < 1) fail('Feed has no <item> entries');

const match = xml.match(/<lastBuildDate>(.*?)<\/lastBuildDate>/);
if (!match) fail('Feed has no <lastBuildDate>');
const buildDate = match[1];
console.log(`lastBuildDate: ${buildDate}`);

const built = new Date(buildDate);
if (Number.isNaN(built.getTime())) fail(`Unparseable lastBuildDate: ${buildDate}`);

const ageHours = (Date.now() - built.getTime()) / 3_600_000;
console.log(`Feed age: ${ageHours.toFixed(1)}h (max ${MAX_AGE_HOURS}h)`);
if (ageHours > MAX_AGE_HOURS) {
	fail(`Feed is stale (older than ${MAX_AGE_HOURS}h) — the publish cron may have stopped`);
}

console.log('Feed is healthy.');
