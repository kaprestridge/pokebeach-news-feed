import { describe, it, expect } from 'vitest';
import { buildRssXml } from '../src/index.js';

describe('buildRssXml', () => {
	it('generates valid RSS 2.0 XML structure', () => {
		const articles = [];
		const xml = buildRssXml(articles);

		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(xml).toContain('<rss version="2.0"');
		expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
		expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
		expect(xml).toContain('<channel>');
		expect(xml).toContain('</channel>');
		expect(xml).toContain('</rss>');
	});

	it('includes channel metadata', () => {
		const xml = buildRssXml([]);

		expect(xml).toContain('<title>PokéBeach News</title>');
		expect(xml).toContain('<link>https://www.pokebeach.com/</link>');
		expect(xml).toContain('<description>Latest news from PokéBeach');
		expect(xml).toContain('<language>en-us</language>');
		expect(xml).toContain('<lastBuildDate>');
	});

	it('generates item elements for articles', () => {
		const articles = [
			{
				title: 'Test Article',
				url: 'https://www.pokebeach.com/test',
				author: 'TestAuthor',
				timestamp: '2026-02-17T07:15:00.000Z',
				image: 'https://www.pokebeach.com/img.jpg',
			},
		];
		const xml = buildRssXml(articles);

		expect(xml).toContain('<item>');
		expect(xml).toContain('<title>Test Article</title>');
		expect(xml).toContain('<link>https://www.pokebeach.com/test</link>');
		expect(xml).toContain('<guid>https://www.pokebeach.com/test</guid>');
		expect(xml).toContain('<pubDate>');
		expect(xml).toContain('<dc:creator>TestAuthor</dc:creator>');
		expect(xml).toContain('<media:thumbnail url="https://www.pokebeach.com/img.jpg"');
		expect(xml).toContain('</item>');
	});

	it('omits pubDate when timestamp is missing', () => {
		const articles = [{ title: 'No Date', url: 'https://example.com/1' }];
		const xml = buildRssXml(articles);

		expect(xml).not.toContain('<pubDate>');
	});

	it('omits dc:creator when author is missing', () => {
		const articles = [{ title: 'No Author', url: 'https://example.com/1' }];
		const xml = buildRssXml(articles);

		expect(xml).not.toContain('<dc:creator>');
	});

	it('omits media:thumbnail when image is missing', () => {
		const articles = [{ title: 'No Image', url: 'https://example.com/1' }];
		const xml = buildRssXml(articles);

		expect(xml).not.toContain('<media:thumbnail');
	});

	it('escapes special XML characters in title', () => {
		const articles = [
			{ title: 'Pikachu & Friends <3 "Pokemon"', url: 'https://example.com/1' },
		];
		const xml = buildRssXml(articles);

		expect(xml).toContain('&amp;');
		expect(xml).toContain('&lt;');
		expect(xml).toContain('&quot;');
		expect(xml).not.toContain('& ');
		expect(xml).not.toContain('<3');
	});

	it('escapes special XML characters in URL', () => {
		const articles = [
			{ title: 'Test', url: 'https://example.com/page?foo=1&bar=2' },
		];
		const xml = buildRssXml(articles);

		expect(xml).toContain('foo=1&amp;bar=2');
	});

	it('escapes special XML characters in author', () => {
		const articles = [
			{ title: 'Test', url: 'https://example.com/1', author: 'Tom & Jerry' },
		];
		const xml = buildRssXml(articles);

		expect(xml).toContain('Tom &amp; Jerry');
	});

	it('handles multiple articles', () => {
		const articles = [
			{ title: 'Article 1', url: 'https://example.com/1' },
			{ title: 'Article 2', url: 'https://example.com/2' },
			{ title: 'Article 3', url: 'https://example.com/3' },
		];
		const xml = buildRssXml(articles);

		const itemCount = (xml.match(/<item>/g) || []).length;
		expect(itemCount).toBe(3);
	});

	it('handles empty articles array', () => {
		const xml = buildRssXml([]);

		expect(xml).toContain('<channel>');
		expect(xml).not.toContain('<item>');
	});
});
