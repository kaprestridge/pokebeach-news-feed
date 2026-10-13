import { describe, it, expect } from 'vitest';
import { parseItems, compareFeeds } from '../scripts/feed-items.mjs';

const feed = (...urls) => `<rss><channel>
${urls.map((u) => `<item><title>T ${u}</title><link>${u}</link><guid>${u}</guid></item>`).join('\n')}
</channel></rss>`;

describe('parseItems', () => {
	it('returns title and url for each item in order', () => {
		expect(parseItems(feed('https://a', 'https://b'))).toEqual([
			{ title: 'T https://a', url: 'https://a' },
			{ title: 'T https://b', url: 'https://b' },
		]);
	});

	it('returns an empty list for a feed with no items', () => {
		expect(parseItems(feed())).toEqual([]);
	});
});

describe('compareFeeds', () => {
	it('reports in sync when both feeds hold the same articles', () => {
		expect(compareFeeds(parseItems(feed('https://a', 'https://b')), parseItems(feed('https://b', 'https://a'))))
			.toEqual({ inSync: true, missing: [], extra: [] });
	});

	it('lists source articles the published feed lacks', () => {
		const source = parseItems(feed('https://new', 'https://a'));
		const published = parseItems(feed('https://a', 'https://old'));
		expect(compareFeeds(source, published)).toEqual({
			inSync: false,
			missing: ['https://new'],
			extra: ['https://old'],
		});
	});
});
