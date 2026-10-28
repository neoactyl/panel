const clampHour = (hour: number) =>
	Math.min(23, Math.max(0, Math.floor(Number.isFinite(hour) ? hour : 0)));

/**
 * A user's "day" starts at the configured UTC hour instead of midnight UTC.
 * The returned key is stored in the afk_session row so caps roll over cleanly.
 */
export const afkDayKey = (now = Date.now(), resetHourUtc = 0) => {
	const hour = clampHour(resetHourUtc);

	return new Date(now - hour * 3_600_000).toISOString().slice(0, 10);
};

export const afkNextDayStart = (now = Date.now(), resetHourUtc = 0) => {
	const hour = clampHour(resetHourUtc);
	const date = new Date(now - hour * 3_600_000);
	date.setUTCHours(24 + hour, 0, 0, 0);

	return date.getTime();
};
