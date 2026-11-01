import { describe, expect, it } from 'vitest';
import {
	databaseConfig,
	isRemoteDatabase,
	resolveDatabaseAuthToken,
	resolveDatabaseUrl
} from './connection.ts';

describe('resolveDatabaseUrl', () => {
	it('prefers DATABASE_URL', () => {
		expect(
			resolveDatabaseUrl({
				DATABASE_URL: 'file:local.db',
				TURSO_DATABASE_URL: 'libsql://example.turso.io'
			})
		).toBe('file:local.db');
	});

	it('falls back to TURSO_DATABASE_URL', () => {
		expect(resolveDatabaseUrl({ TURSO_DATABASE_URL: 'libsql://example.turso.io' })).toBe(
			'libsql://example.turso.io'
		);
	});

	it('treats blank values as unset', () => {
		expect(resolveDatabaseUrl({ DATABASE_URL: '  ', TURSO_DATABASE_URL: '' })).toBeUndefined();
	});
});

describe('resolveDatabaseAuthToken', () => {
	it('prefers DATABASE_AUTH_TOKEN and falls back to TURSO_AUTH_TOKEN', () => {
		expect(
			resolveDatabaseAuthToken({
				DATABASE_AUTH_TOKEN: 'database-token',
				TURSO_AUTH_TOKEN: 'turso-token'
			})
		).toBe('database-token');
		expect(resolveDatabaseAuthToken({ TURSO_AUTH_TOKEN: 'turso-token' })).toBe('turso-token');
	});
});

describe('isRemoteDatabase', () => {
	it('detects networked libSQL and Turso URLs', () => {
		expect(isRemoteDatabase('libsql://example.turso.io')).toBe(true);
		expect(isRemoteDatabase('https://example.turso.io')).toBe(true);
		expect(isRemoteDatabase('wss://example.turso.io')).toBe(true);
		expect(isRemoteDatabase('file:local.db')).toBe(false);
		expect(isRemoteDatabase(undefined)).toBe(false);
	});
});

describe('databaseConfig', () => {
	it('returns the URL with an optional auth token', () => {
		expect(databaseConfig({ TURSO_DATABASE_URL: 'libsql://example.turso.io' })).toEqual({
			url: 'libsql://example.turso.io'
		});
		expect(
			databaseConfig({
				TURSO_DATABASE_URL: 'libsql://example.turso.io',
				TURSO_AUTH_TOKEN: 'secret'
			})
		).toEqual({ url: 'libsql://example.turso.io', authToken: 'secret' });
	});

	it('throws a helpful error when no database is configured', () => {
		expect(() => databaseConfig({})).toThrow(/DATABASE_URL \(or TURSO_DATABASE_URL\)/);
	});
});
