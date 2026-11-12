import { describe, expect, it } from 'vitest';
import { renderSubjectString, renderTemplateString } from '#lib/server/email/templates.ts';

describe('renderSubjectString', () => {
	it('does not HTML-escape variable values', () => {
		expect(renderSubjectString('Welcome to {{brandName}}', { brandName: 'A & B' })).toBe(
			'Welcome to A & B'
		);
	});

	it('removes CR/LF and control characters from headers', () => {
		expect(
			renderSubjectString('Hello {{userName}}', {
				userName: 'Alex\r\nBcc: victim@example.com'
			})
		).toBe('Hello Alex Bcc: victim@example.com');
	});

	it('collapses whitespace in the template itself', () => {
		expect(renderSubjectString('  Hello\n\n{{name}}  ', { name: 'Alex' })).toBe('Hello Alex');
	});
});

describe('renderTemplateString', () => {
	it('still escapes values inserted into HTML', () => {
		expect(renderTemplateString('<p>{{value}}</p>', { value: '<script>' })).toBe(
			'<p>&lt;script&gt;</p>'
		);
	});
});
