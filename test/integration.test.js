import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('HTTP Endpoints', () => {
	let worker;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.js', {
			experimental: { disableExperimentalWarning: true },
			vars: {
				RSS_ENABLED: 'false',
				API_KEY: 'test-api-key',
			},
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	describe('GET /', () => {
		it('returns 200 with health message', async () => {
			const response = await worker.fetch('/');
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toBe('PokéBeach News Worker is running.');
		});

		it('returns 405 for non-GET methods', async () => {
			const response = await worker.fetch('/', { method: 'POST' });
			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toBe('GET');
		});
	});

	describe('POST /trigger', () => {
		it('returns 401 without API key', async () => {
			const response = await worker.fetch('/trigger', { method: 'POST' });
			expect(response.status).toBe(401);
			const text = await response.text();
			expect(text).toBe('Unauthorized');
		});

		it('returns 401 with wrong API key', async () => {
			const response = await worker.fetch('/trigger', {
				method: 'POST',
				headers: { 'X-API-Key': 'wrong-key' },
			});
			expect(response.status).toBe(401);
		});

		it('returns 405 for non-POST methods', async () => {
			const response = await worker.fetch('/trigger', { method: 'GET' });
			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toBe('POST');
		});
	});

	describe('POST /seed', () => {
		it('returns 401 without API key', async () => {
			const response = await worker.fetch('/seed', { method: 'POST' });
			expect(response.status).toBe(401);
			const text = await response.text();
			expect(text).toBe('Unauthorized');
		});

		it('returns 401 with wrong API key', async () => {
			const response = await worker.fetch('/seed', {
				method: 'POST',
				headers: { 'X-API-Key': 'wrong-key' },
			});
			expect(response.status).toBe(401);
		});

		it('returns 405 for non-POST methods', async () => {
			const response = await worker.fetch('/seed', { method: 'GET' });
			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toBe('POST');
		});
	});

	describe('GET /feed', () => {
		it('returns 404 when RSS is disabled', async () => {
			const response = await worker.fetch('/feed');
			expect(response.status).toBe(404);
			const text = await response.text();
			expect(text).toBe('RSS feed is disabled');
		});

		it('returns 405 for non-GET methods', async () => {
			const response = await worker.fetch('/feed', { method: 'POST' });
			expect(response.status).toBe(405);
			expect(response.headers.get('Allow')).toBe('GET');
		});
	});

	describe('Unknown routes', () => {
		it('returns 404 for unknown paths', async () => {
			const response = await worker.fetch('/unknown');
			expect(response.status).toBe(404);
			const text = await response.text();
			expect(text).toBe('Not found');
		});

		it('returns 404 for nested unknown paths', async () => {
			const response = await worker.fetch('/api/v1/something');
			expect(response.status).toBe(404);
		});
	});
});
