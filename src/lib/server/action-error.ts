import { fail } from '@sveltejs/kit';

export const DEFAULT_ACTION_MESSAGE = 'Something went wrong. Please try again.';

type CodedFailure = { message: string; code: string };

const isCodedFailure = (cause: unknown): cause is CodedFailure =>
	typeof cause === 'object' &&
	cause !== null &&
	'message' in cause &&
	'code' in cause &&
	typeof (cause as CodedFailure).message === 'string' &&
	typeof (cause as CodedFailure).code === 'string';

/**
 * Build a 400 form failure while hiding messages from unknown error types.
 * Domain errors that carry a code are safe to show to the user.
 */
export const actionFailure = (cause: unknown, fallback = DEFAULT_ACTION_MESSAGE) =>
	fail(400, { error: isCodedFailure(cause) ? cause.message : fallback });
