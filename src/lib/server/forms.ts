/** Shared parsers for SvelteKit form values. */

export const formString = (data: FormData, key: string) => String(data.get(key) ?? '').trim();

/**
 * Parse a whole number at or above `minimum`.
 * Returns null when the value is missing or invalid.
 */
export const toInt = (
	value: FormDataEntryValue | string | null | undefined,
	minimum = 0
): number | null => {
	if (value === null || value === undefined) return null;

	const raw = String(value).trim();
	if (!raw) return null;

	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed >= minimum ? parsed : null;
};

/**
 * Like `toInt`, but distinguishes an absent value (undefined) from an invalid one (null).
 */
export const toOptionalInt = (
	value: FormDataEntryValue | string | null | undefined,
	minimum = 0
): number | undefined | null => {
	if (value === null || value === undefined || String(value).trim() === '') return undefined;
	return toInt(value, minimum);
};

export const formInt = (data: FormData, key: string, minimum = 0): number | null =>
	toInt(data.get(key), minimum);

/** Parse a finite number, falling back when the value is missing or not numeric. */
export const formNumber = (data: FormData, key: string, fallback = 0) => {
	const raw = formString(data, key);
	if (!raw) return fallback;

	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const formBoolean = (data: FormData, key: string) => {
	const value = formString(data, key).toLowerCase();
	return value === 'on' || value === 'true' || value === '1';
};
