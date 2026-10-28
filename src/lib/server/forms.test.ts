import { describe, expect, it } from 'vitest';
import {
	formBoolean,
	formInt,
	formNumber,
	formString,
	toInt,
	toOptionalInt
} from './forms.ts';

const form = (values: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
};

describe('formString', () => {
	it('trims whitespace and returns an empty string for missing keys', () => {
		expect(formString(form({ name: '  Neo  ' }), 'name')).toBe('Neo');
		expect(formString(form({}), 'name')).toBe('');
	});
});

describe('toInt', () => {
	it('accepts whole numbers at or above the minimum', () => {
		expect(toInt('10', 0)).toBe(10);
		expect(toInt(4, 1)).toBe(4);
	});

	it('rejects fractions, negatives below the minimum and junk', () => {
		expect(toInt('1.5')).toBeNull();
		expect(toInt('-1')).toBeNull();
		expect(toInt('abc')).toBeNull();
		expect(toInt('')).toBeNull();
		expect(toInt(null)).toBeNull();
	});
});

describe('toOptionalInt', () => {
	it('distinguishes absent values from invalid ones', () => {
		expect(toOptionalInt('')).toBeUndefined();
		expect(toOptionalInt(null)).toBeUndefined();
		expect(toOptionalInt('nope')).toBeNull();
		expect(toOptionalInt('2', 1)).toBe(2);
	});
});

describe('formInt', () => {
	it('reads a whole number from FormData', () => {
		expect(formInt(form({ count: '3' }), 'count')).toBe(3);
		expect(formInt(form({ count: '3.5' }), 'count')).toBeNull();
	});
});

describe('formNumber', () => {
	it('parses finite numbers and falls back otherwise', () => {
		expect(formNumber(form({ price: '12.5' }), 'price')).toBe(12.5);
		expect(formNumber(form({ price: 'x' }), 'price', 7)).toBe(7);
		expect(formNumber(form({}), 'price', 7)).toBe(7);
	});
});

describe('formBoolean', () => {
	it('accepts the common checkbox encodings', () => {
		expect(formBoolean(form({ enabled: 'on' }), 'enabled')).toBe(true);
		expect(formBoolean(form({ enabled: 'true' }), 'enabled')).toBe(true);
		expect(formBoolean(form({ enabled: '1' }), 'enabled')).toBe(true);
		expect(formBoolean(form({ enabled: 'off' }), 'enabled')).toBe(false);
	});
});
