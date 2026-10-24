import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { serverEnv } from '../config/env.ts';

const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

const derive = (value: string) => createHash('sha256').update(value, 'utf8').digest();

const key = () => derive(serverEnv.SETTINGS_ENCRYPTION_KEY ?? serverEnv.BETTER_AUTH_SECRET);

const split = (value: string) => value.split(':');

export const isEncryptedSecret = (value: string) => value.startsWith(`${PREFIX}:`);

export const encryptSecret = (plaintext: string): string => {
	if (!plaintext) return '';
	if (isEncryptedSecret(plaintext)) return plaintext;

	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
		':'
	);
};

export const decryptSecret = (value: string): string => {
	if (!value) return '';
	if (!isEncryptedSecret(value)) return value;

	const parts = split(value);
	const [prefix, iv, tag, ciphertext] = parts;

	if (prefix !== PREFIX || parts.length !== 4 || !iv || !tag || !ciphertext) {
		throw new Error('Encrypted secret has an invalid format.');
	}

	const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));

	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, 'base64')),
		decipher.final()
	]).toString('utf8');
};
