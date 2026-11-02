export type DateInput = Date | string | number;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric'
};

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
};

export const formatDate = (value: DateInput) => new Date(value).toLocaleDateString(undefined, DATE_FORMAT);

export const formatDateTime = (value: DateInput) =>
	new Date(value).toLocaleString(undefined, DATE_TIME_FORMAT);

export const formatDateOrDash = (value: DateInput | null | undefined) =>
	value ? formatDateTime(value) : '—';

export const formatPrice = (cents: number | string, currency: string) => {
	const amount = Number(cents) / 100;

	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: currency.toUpperCase()
		}).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
	}
};

export const formatBytes = (bytes: number | null) => {
	if (bytes === null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatMegabytes = (megabytes: number) => `${(megabytes / 1024).toFixed(1)} GB`;

export const formatDuration = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const initials = (value: string, parts = 2) =>
	value
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, parts)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
