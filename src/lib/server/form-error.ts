/** Returns the first error message attached to a validated superforms object. */
export const firstFormError = (form: unknown): string => {
	const errors = ((form as { errors?: unknown })?.errors ?? {}) as Record<string, unknown>;

	for (const value of Object.values(errors)) {
		const flat = Array.isArray(value) ? value.flat?.() ?? value : [];
		for (const entry of flat) {
			if (typeof entry === 'string' && entry) return entry;
		}
	}

	return 'Check the form and try again.';
};
