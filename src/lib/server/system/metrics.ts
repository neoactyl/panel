export type SlowCall = {
	method: string;
	path: string;
	status: number;
	durationMs: number;
	at: string;
};

const state = {
	requests: 0,
	errors: 0,
	totalMs: 0,
	maxMs: 0,
	slowCalls: [] as SlowCall[],
	cacheHits: 0,
	cacheMisses: 0,
	startedAt: Date.now()
};

const SLOW_LIMIT = 50;

export const recordRequest = (
	method: string,
	path: string,
	status: number,
	durationMs: number,
	slowThresholdMs = 750
) => {
	state.requests += 1;
	state.totalMs += durationMs;
	state.maxMs = Math.max(state.maxMs, durationMs);
	if (status >= 500) state.errors += 1;

	if (durationMs >= slowThresholdMs) {
		state.slowCalls.unshift({
			method,
			path,
			status,
			durationMs: Math.round(durationMs),
			at: new Date().toISOString()
		});
		if (state.slowCalls.length > SLOW_LIMIT) state.slowCalls.length = SLOW_LIMIT;
	}
};

export const recordSettingsCache = (hit: boolean) => {
	if (hit) state.cacheHits += 1;
	else state.cacheMisses += 1;
};

export const resetMetrics = () => {
	state.requests = 0;
	state.errors = 0;
	state.totalMs = 0;
	state.maxMs = 0;
	state.slowCalls = [];
	state.cacheHits = 0;
	state.cacheMisses = 0;
	state.startedAt = Date.now();
};

const memory = () => {
	const usage = process.memoryUsage();
	return {
		rss: usage.rss,
		heapUsed: usage.heapUsed,
		heapTotal: usage.heapTotal,
		external: usage.external
	};
};

export const getMetrics = () => {
	const memoryUsage = memory();
	const cacheTotal = state.cacheHits + state.cacheMisses;

	return {
		startedAt: new Date(state.startedAt).toISOString(),
		uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
		requests: state.requests,
		errors: state.errors,
		errorRate: state.requests ? (state.errors / state.requests) * 100 : 0,
		averageMs: state.requests ? state.totalMs / state.requests : 0,
		maxMs: state.maxMs,
		cache: {
			hits: state.cacheHits,
			misses: state.cacheMisses,
			hitRate: cacheTotal ? (state.cacheHits / cacheTotal) * 100 : 0
		},
		memory: memoryUsage,
		slowCalls: [...state.slowCalls]
	};
};
