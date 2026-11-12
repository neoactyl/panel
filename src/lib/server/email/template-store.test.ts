import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	getEmailTemplateFilePath,
	readEmailTemplateFile,
	updateEmailTemplateFile
} from '#lib/server/email/template-store.ts';

let directory: string;
let file: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'neoactyl-email-'));
	file = join(directory, 'email-templates.json');
	process.env.EMAIL_TEMPLATES_FILE = file;
});

afterEach(async () => {
	delete process.env.EMAIL_TEMPLATES_FILE;
	await rm(directory, { recursive: true, force: true });
});

describe('email template file store', () => {
	it('uses the configured path', () => {
		expect(getEmailTemplateFilePath()).toBe(file);
	});

	it('returns an empty set when the file does not exist', async () => {
		expect(await readEmailTemplateFile()).toEqual({});
	});

	it('writes and reads overrides', async () => {
		await updateEmailTemplateFile((templates) => {
			templates.topup = { subject: 'Thanks', body: '<p>Hi</p>' };
		});

		expect(await readEmailTemplateFile()).toEqual({
			topup: { subject: 'Thanks', body: '<p>Hi</p>' }
		});

		await updateEmailTemplateFile((templates) => {
			delete templates.topup;
			templates.layout = { subject: '', body: '<html></html>' };
		});

		expect(await readEmailTemplateFile()).toEqual({
			layout: { subject: '', body: '<html></html>' }
		});
	});

	it('drops malformed entries instead of failing every send', async () => {
		await writeFile(
			file,
			JSON.stringify({ good: { subject: 'Hi', body: '<p>x</p>' }, bad: 'nope', other: { body: 42 } }),
			'utf8'
		);

		expect(await readEmailTemplateFile()).toEqual({
			good: { subject: 'Hi', body: '<p>x</p>' },
			other: {}
		});
	});

	it('writes valid pretty-printed JSON', async () => {
		await updateEmailTemplateFile((templates) => {
			templates.topup = { subject: 'Thanks', body: '<p>Hi</p>' };
		});

		const raw = await readFile(file, 'utf8');
		expect(raw.endsWith('\n')).toBe(true);
		expect(raw).toContain('"topup"');
	});
});
