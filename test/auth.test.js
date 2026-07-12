import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../src/index.js';

describe('isAuthorized', () => {
	const makeRequest = (apiKey) => {
		const headers = new Headers();
		if (apiKey !== undefined) {
			headers.set('X-API-Key', apiKey);
		}
		return { headers };
	};

	it('returns true when API key matches', () => {
		const request = makeRequest('secret-key-123');
		const env = { API_KEY: 'secret-key-123' };
		expect(isAuthorized(request, env)).toBe(true);
	});

	it('returns false when API key does not match', () => {
		const request = makeRequest('wrong-key');
		const env = { API_KEY: 'secret-key-123' };
		expect(isAuthorized(request, env)).toBe(false);
	});

	it('returns false when X-API-Key header is missing', () => {
		const request = { headers: new Headers() };
		const env = { API_KEY: 'secret-key-123' };
		expect(isAuthorized(request, env)).toBe(false);
	});

	it('returns falsy when env.API_KEY is not set', () => {
		const request = makeRequest('some-key');
		const env = {};
		expect(isAuthorized(request, env)).toBeFalsy();
	});

	it('returns falsy when both API_KEY and header are missing', () => {
		const request = { headers: new Headers() };
		const env = {};
		expect(isAuthorized(request, env)).toBeFalsy();
	});

	it('returns falsy when env.API_KEY is empty string', () => {
		const request = makeRequest('');
		const env = { API_KEY: '' };
		expect(isAuthorized(request, env)).toBeFalsy();
	});

	it('is case-sensitive for API key comparison', () => {
		const request = makeRequest('Secret-Key-123');
		const env = { API_KEY: 'secret-key-123' };
		expect(isAuthorized(request, env)).toBe(false);
	});
});
