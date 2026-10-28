import { describe, expect, it } from 'vitest';
import { firstFormError } from './form-error.ts';

describe('firstFormError', () => {
	it('returns the first string error found', () => {
		expect(firstFormError({ errors: { email: ['Enter a valid email address.'] } })).toBe(
			'Enter a valid email address.'
		);
	});

	it('handles flat and non-array error values', () => {
		expect(firstFormError({ errors: { name: 'Name is required.' } })).toBe('Name is required.');
	});

	it('falls back when no usable error exists', () => {
		expect(firstFormError({})).toBe('Check the form and try again.');
		expect(firstFormError(null)).toBe('Check the form and try again.');
		expect(firstFormError({ errors: { field: [] } })).toBe('Check the form and try again.');
	});
});
