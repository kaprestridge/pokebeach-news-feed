import { describe, it, expect } from 'vitest';
import { parseArticles, extractArticle, parseDate } from '../src/index.js';

describe('parseDate', () => {
	it('parses standard date format and returns ISO string', () => {
		const result = parseDate('Feb 17, 2026 at 2:15 AM');
		expect(result).not.toBeNull();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		// Verify it creates a valid date
		const date = new Date(result);
		expect(date.getFullYear()).toBe(2026);
		expect(date.getMonth()).toBe(1); // February (0-indexed)
	});

	it('parses date with PM time', () => {
		const result = parseDate('Dec 25, 2025 at 11:30 PM');
		expect(result).not.toBeNull();
		const date = new Date(result);
		expect(date.getFullYear()).toBe(2025);
		expect(date.getMonth()).toBe(11); // December
		expect(date.getDate()).toBe(25);
	});

	it('returns null for invalid date', () => {
		expect(parseDate('not a date')).toBeNull();
		expect(parseDate('')).toBeNull();
	});

	it('handles different month formats', () => {
		const jan = parseDate('Jan 1, 2026 at 12:00 PM');
		const dec = parseDate('Dec 31, 2025 at 11:59 PM');
		expect(jan).not.toBeNull();
		expect(dec).not.toBeNull();
	});
});

describe('extractArticle', () => {
	const makeArticleHtml = (opts = {}) => {
		const title = opts.title ?? 'Test Article Title';
		const url = opts.url ?? 'https://www.pokebeach.com/2026/02/test-article';
		const author = opts.author ?? 'WaterPokemonMaster';
		const date = opts.date ?? 'Feb 17, 2026 at 2:15 AM';
		const image = opts.image ?? 'https://www.pokebeach.com/images/test.jpg';
		const includeAuthor = opts.includeAuthor !== false;
		const includeImage = opts.includeImage !== false;
		const includeDate = opts.includeDate !== false;

		return `
			<article class="post type-post">
				<h2 class="entry-title"><a href="${url}">${title}</a></h2>
				<ul class="entry-meta">
					${includeAuthor ? `<li><a class="article__author" href="/author/water">${author}</a></li>` : ''}
					${includeDate ? `<li>Posted on ${date}</li>` : ''}
				</ul>
				${includeImage ? `<div class="xpress_articleImage--full"><img src="${image}" /></div>` : ''}
			</article>
		`;
	};

	it('extracts title and URL', () => {
		const html = makeArticleHtml({ title: 'New Pokemon Revealed', url: 'https://www.pokebeach.com/2026/02/new-pokemon' });
		const article = extractArticle(html);
		expect(article.title).toBe('New Pokemon Revealed');
		expect(article.url).toBe('https://www.pokebeach.com/2026/02/new-pokemon');
	});

	it('extracts author', () => {
		const html = makeArticleHtml({ author: 'Elite Four Member' });
		const article = extractArticle(html);
		expect(article.author).toBe('Elite Four Member');
	});

	it('extracts date and timestamp', () => {
		const html = makeArticleHtml({ date: 'Feb 17, 2026 at 2:15 AM' });
		const article = extractArticle(html);
		expect(article.dateText).toBe('Feb 17, 2026 at 2:15 AM');
		expect(article.timestamp).not.toBeNull();
	});

	it('extracts image', () => {
		const html = makeArticleHtml({ image: 'https://www.pokebeach.com/images/pikachu.jpg' });
		const article = extractArticle(html);
		expect(article.image).toBe('https://www.pokebeach.com/images/pikachu.jpg');
	});

	it('handles missing author', () => {
		const html = makeArticleHtml({ includeAuthor: false });
		const article = extractArticle(html);
		expect(article.author).toBeNull();
	});

	it('handles missing image', () => {
		const html = makeArticleHtml({ includeImage: false });
		const article = extractArticle(html);
		expect(article.image).toBeNull();
	});

	it('handles missing date', () => {
		const html = makeArticleHtml({ includeDate: false });
		const article = extractArticle(html);
		expect(article.dateText).toBeNull();
		expect(article.timestamp).toBeNull();
	});

	it('converts relative URLs to absolute', () => {
		const html = `
			<article>
				<h2><a href="/2026/02/relative-url">Relative URL Test</a></h2>
				<ul class="entry-meta"></ul>
			</article>
		`;
		const article = extractArticle(html);
		expect(article.url).toBe('https://www.pokebeach.com/2026/02/relative-url');
	});

	it('returns null if no article tag', () => {
		const html = '<div>Not an article</div>';
		expect(extractArticle(html)).toBeNull();
	});

	it('returns null if no title link', () => {
		const html = '<article><p>No title link here</p></article>';
		expect(extractArticle(html)).toBeNull();
	});

	it('returns null if link has no href', () => {
		const html = '<article><h2><a>No href</a></h2></article>';
		expect(extractArticle(html)).toBeNull();
	});
});

describe('parseArticles', () => {
	const makeArticleHtml = (title, url) => `
		<article class="post">
			<h2 class="entry-title"><a href="${url}">${title}</a></h2>
			<ul class="entry-meta">
				<li><a class="article__author">Author</a></li>
				<li>Posted on Feb 17, 2026 at 2:15 AM</li>
			</ul>
		</article>
	`;

	it('parses multiple articles from HTML', () => {
		const html = `
			<html>
			<body>
				${makeArticleHtml('Article One', 'https://www.pokebeach.com/1')}
				${makeArticleHtml('Article Two', 'https://www.pokebeach.com/2')}
				${makeArticleHtml('Article Three', 'https://www.pokebeach.com/3')}
			</body>
			</html>
		`;
		const articles = parseArticles(html);
		expect(articles).toHaveLength(3);
		expect(articles[0].title).toBe('Article One');
		expect(articles[1].title).toBe('Article Two');
		expect(articles[2].title).toBe('Article Three');
	});

	it('returns empty array for HTML with no articles', () => {
		const html = '<html><body><p>No articles here</p></body></html>';
		const articles = parseArticles(html);
		expect(articles).toEqual([]);
	});

	it('skips malformed articles gracefully', () => {
		const html = `
			<html>
			<body>
				${makeArticleHtml('Good Article', 'https://www.pokebeach.com/good')}
				<article><p>Bad article with no title link</p></article>
				${makeArticleHtml('Another Good One', 'https://www.pokebeach.com/another')}
			</body>
			</html>
		`;
		const articles = parseArticles(html);
		expect(articles).toHaveLength(2);
	});

	it('handles empty HTML', () => {
		expect(parseArticles('')).toEqual([]);
	});
});
