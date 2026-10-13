import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifyPublisher } from '../src/index.js';

const articles = [
	{ title: 'Newest', url: 'https://www.pokebeach.com/2026/10/newest' },
	{ title: 'Older', url: 'https://www.pokebeach.com/2026/10/older' },
];

function makeKv(initial = {}) {
	const store = new Map(Object.entries(initial));
	return {
		store,
		get: vi.fn(async (key) => store.get(key) ?? null),
		put: vi.fn(async (key, value) => { store.set(key, value); }),
	};
}

function makeEnv(overrides = {}) {
	return {
		GITHUB_TOKEN: 'test-token',
		GITHUB_REPO: 'owner/repo',
		POSTED_ARTICLES: makeKv(),
		...overrides,
	};
}

function mockFetch(status) {
	const fetchMock = vi.fn(async () => new Response(null, { status }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('notifyPublisher', () => {
	it('dispatches to GitHub on first run', async () => {
		const fetchMock = mockFetch(204);
		const env = makeEnv();

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: true });
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.github.com/repos/owner/repo/dispatches');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer test-token');
		expect(init.headers.Accept).toBe('application/vnd.github+json');
		expect(init.headers['User-Agent']).toBeTruthy();
		expect(JSON.parse(init.body)).toEqual({
			event_type: 'feed-updated',
			client_payload: { urls: articles.map((a) => a.url) },
		});
	});

	it('records the published article list after a successful dispatch', async () => {
		mockFetch(204);
		const env = makeEnv();

		await notifyPublisher(env, articles);

		expect(env.POSTED_ARTICLES.put).toHaveBeenCalledWith(
			'publish:last-dispatched',
			articles.map((a) => a.url).join('\n'),
		);
	});

	it('skips the dispatch when the article list matches the last dispatch', async () => {
		const fetchMock = mockFetch(204);
		const env = makeEnv({
			POSTED_ARTICLES: makeKv({ 'publish:last-dispatched': articles.map((a) => a.url).join('\n') }),
		});

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: false, reason: 'unchanged' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('dispatches when a new article appears', async () => {
		const fetchMock = mockFetch(204);
		const env = makeEnv({
			POSTED_ARTICLES: makeKv({ 'publish:last-dispatched': articles[1].url }),
		});

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: true });
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('leaves the stored list untouched when GitHub rejects the dispatch, so the next run retries', async () => {
		mockFetch(401);
		const env = makeEnv();

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: false, reason: 'github-401' });
		expect(env.POSTED_ARTICLES.put).not.toHaveBeenCalled();
	});

	it('leaves the stored list untouched when the request throws', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
		const env = makeEnv();

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: false, reason: 'network down' });
		expect(env.POSTED_ARTICLES.put).not.toHaveBeenCalled();
	});

	it('does nothing when GitHub is not configured', async () => {
		const fetchMock = mockFetch(204);
		const env = makeEnv({ GITHUB_TOKEN: undefined });

		const result = await notifyPublisher(env, articles);

		expect(result).toEqual({ dispatched: false, reason: 'not-configured' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does nothing when there are no articles', async () => {
		const fetchMock = mockFetch(204);
		const env = makeEnv();

		const result = await notifyPublisher(env, []);

		expect(result).toEqual({ dispatched: false, reason: 'no-articles' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
