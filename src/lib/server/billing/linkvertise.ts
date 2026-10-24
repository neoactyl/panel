import { constants, createPublicKey, publicEncrypt } from 'node:crypto';

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1piHDY9WRIehbfC3Fpol
Ly/WrJF8TKFVdDMobj3fkNjN/69dTv9JgXt+gcJxVn/h4NCMtQ2mCQXNBMXzLOky
HJipiFMoyPtOOlMlbWRAiaQE1GpMebGNRcsxYnWzF53v63+hUQgrMahH9X0Ii/NJ
hvDyFlPX77+z9xiyd45L+xrgayePpOxvQpj6VJDlpNNKWbuIkFvkMmUVRM2TLulL
JSgs4EgoBZgTYRpmhgR8tYfDOW+cOctffggcMAzKUC2CzYNmhzX15O7DKaZdYgfa
BR/hqvyNAxBepHOJnBfHkQqaox5diHGqdwXXLwiJKzoK5R26vaI3jg2+d69VPSGL
0QIDAQAB
-----END PUBLIC KEY-----`;

const KEY = createPublicKey(PUBLIC_KEY);

export class LinkvertiseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LinkvertiseError';
	}
}

export const parseLinkvertisePublisherId = (value: string) => {
	const id = Number(value.trim());
	return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const isLinkvertiseUrl = (value: string) => {
	try {
		const host = new URL(value).hostname.toLowerCase();
		return host === 'linkvertise.com' || host.endsWith('.linkvertise.com') || host === 'link-to.net' || host.endsWith('.link-to.net');
	} catch {
		return false;
	}
};

export const createLinkvertiseLink = (destination: string, publisherId: number) => {
	let url: URL;

	try {
		url = new URL(destination);
	} catch {
		throw new LinkvertiseError('The destination URL is invalid.');
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new LinkvertiseError('The destination URL must use HTTP or HTTPS.');
	}

	if (!Number.isSafeInteger(publisherId) || publisherId <= 0) {
		throw new LinkvertiseError('The Linkvertise publisher ID is invalid.');
	}

	const encoded = Buffer.from(url.href, 'utf8');
	const head = encoded.subarray(0, 70);
	const tail = encoded.subarray(70).toString('utf8');
	const encrypted = publicEncrypt(
		{ key: KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
		head
	).toString('base64');

	const payload = encodeURIComponent(`${encrypted}${tail}`);
	const bucket = Math.floor(Math.random() * 1000);

	return `https://link-to.net/${publisherId}/${bucket}/dynamic/?r=${payload}&v=2`;
};
