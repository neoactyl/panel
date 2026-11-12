import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Admin-edited email templates are stored as JSON on disk rather than in the
 * database. Only templates that differ from the built-in defaults are written,
 * so the file can stay small and is easy to back up or version.
 */
export type StoredEmailTemplate = {
	subject?: string;
	body?: string;
};

export type EmailTemplateFile = Record<string, StoredEmailTemplate>;

/**
 * Resolve the template file location. Prefer an explicit override, otherwise
 * keep the file next to the SQLite database (which is normally the mounted
 * data volume) and fall back to `data/email-templates.json` for hosted
 * databases.
 */
export const getEmailTemplateFilePath = () => {
	const configured = process.env.EMAIL_TEMPLATES_FILE?.trim();
	if (configured) return resolve(configured);

	const databaseUrl = (
		process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL
	)?.trim();

	if (databaseUrl?.toLowerCase().startsWith('file:')) {
		const rawPath = databaseUrl.slice('file:'.length).split('?')[0];
		if (rawPath) {
			const databasePath = isAbsolute(rawPath)
				? rawPath
				: resolve(process.cwd(), rawPath);

			return join(dirname(databasePath), 'email-templates.json');
		}
	}

	return join(process.cwd(), 'data', 'email-templates.json');
};

const parseTemplateFile = (raw: string): EmailTemplateFile => {
	const parsed: unknown = JSON.parse(raw);

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

	const templates: EmailTemplateFile = {};

	for (const [key, value] of Object.entries(parsed)) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

		const { subject, body } = value as Record<string, unknown>;
		templates[key] = {
			...(typeof subject === 'string' ? { subject } : {}),
			...(typeof body === 'string' ? { body } : {})
		};
	}

	return templates;
};

export const readEmailTemplateFile = async (): Promise<EmailTemplateFile> => {
	const file = getEmailTemplateFilePath();

	try {
		return parseTemplateFile(await readFile(file, 'utf8'));
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return {};

		// A corrupt or unreadable file should never stop mail from being sent:
		// fall back to the built-in templates until an admin saves again.
		console.error(`Unable to read email templates from ${file}.`, cause);
		return {};
	}
};

const writeEmailTemplateFile = async (templates: EmailTemplateFile) => {
	const file = getEmailTemplateFilePath();
	await mkdir(dirname(file), { recursive: true });

	// Write to a temporary file in the same directory, then rename so readers
	// never observe a half-written template file.
	const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(templates, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600
	});
	await rename(temporary, file);
};

let pendingWrite: Promise<unknown> = Promise.resolve();

/** Serialize read-modify-write updates within this process. */
export const updateEmailTemplateFile = (
	mutate: (templates: EmailTemplateFile) => void
) => {
	const run = pendingWrite.then(async () => {
		const templates = await readEmailTemplateFile();
		mutate(templates);
		await writeEmailTemplateFile(templates);
	});

	pendingWrite = run.catch(() => undefined);
	return run;
};
