export const usageColor = (percent: number) => {
	const clamped = Math.min(100, Math.max(0, percent));
	return `hsl(${Math.max(0, 140 - clamped * 1.4)} 70% 50%)`;
};
