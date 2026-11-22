/**
 * Deliberately ad-shaped probe used by the panel's anti-adblock check. Every
 * request has a cache-busting query string, so blockers that filter `/ads/`
 * URLs or tracker-like paths produce a failed image load.
 */
const PIXEL = Uint8Array.from(
	Buffer.from(
		'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
		'base64'
	)
);

export const GET = () =>
	new Response(PIXEL, {
		headers: {
			'content-type': 'image/gif',
			'cache-control': 'no-store, max-age=0',
			'content-length': String(PIXEL.byteLength),
			'x-robots-tag': 'noindex'
		}
	});
