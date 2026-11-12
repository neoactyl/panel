import { fail } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/auth/admin.ts';
import {
	getBool,
	getBranding,
	getSetting,
	loadSettings,
	updateSettings,
	type SettingKey
} from '#lib/server/config/settings.ts';
import {
	EMAIL_EVENTS,
	findEmailEvent
} from '#lib/server/email/events.ts';
import {
	emailEventSettings,
	getSmtpConfig,
	listEmailTemplates,
	resetEmailTemplate,
	resetEmailTransport,
	saveEmailTemplate,
	sendTestEmail,
	verifySmtpConnection
} from '#lib/server/email/mailer.ts';
import { getEmailTemplateFilePath } from '#lib/server/email/template-store.ts';
import { findEmailTemplate } from '#lib/server/email/templates.ts';
import { formBoolean, formInt, formString } from '#lib/server/forms.ts';
import { logActivity } from '#lib/server/system/logs.ts';
import type { Actions, PageServerLoad } from './$types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const config = getSmtpConfig();

	return {
		branding: getBranding(),
		smtp: {
			enabled: config.enabled,
			host: config.host,
			port: config.port,
			secure: config.secure,
			requireTls: config.requireTls,
			user: config.user,
			fromEmail: config.fromEmail,
			fromName: config.fromName,
			replyTo: config.replyTo,
			passwordSet: Boolean(getSetting('smtp.password')),
			configured: config.configured
		},
		requireEmailVerification: getBool('auth.requireEmailVerification'),
		events: emailEventSettings(),
		templateFile: getEmailTemplateFilePath(),
		templates: await listEmailTemplates()
	};
};

export const actions: Actions = {
	saveSmtp: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const enabled = formBoolean(data, 'smtp.enabled');
		const host = formString(data, 'smtp.host');
		const port = formInt(data, 'smtp.port', 1);
		const fromEmail = formString(data, 'smtp.fromEmail');
		const user = formString(data, 'smtp.user');
		const requireVerification = formBoolean(data, 'auth.requireEmailVerification');
		const effectiveSender = fromEmail || user;

		if (enabled && !host) {
			return fail(400, { error: 'Enter the SMTP server hostname before enabling email.' });
		}
		if (port === null || port > 65_535) {
			return fail(400, { error: 'The SMTP port must be a whole number between 1 and 65535.' });
		}
		if (enabled && (!effectiveSender || !emailPattern.test(effectiveSender))) {
			return fail(400, {
				error: 'Enter a valid sender email address, or an SMTP username that is an email address.'
			});
		}
		if (requireVerification && !(enabled && host && effectiveSender)) {
			return fail(400, {
				error:
					'Configure and enable SMTP before requiring email verification, otherwise new users cannot sign in.'
			});
		}

		const replyTo = formString(data, 'smtp.replyTo');
		if (replyTo && !emailPattern.test(replyTo)) {
			return fail(400, { error: 'Enter a valid reply-to address.' });
		}

		const values: Partial<Record<SettingKey, string>> = {
			'smtp.enabled': enabled ? 'true' : 'false',
			'smtp.host': host,
			'smtp.port': String(port),
			'smtp.secure': formBoolean(data, 'smtp.secure') ? 'true' : 'false',
			'smtp.requireTls': formBoolean(data, 'smtp.requireTls') ? 'true' : 'false',
			'smtp.user': user,
			'smtp.fromEmail': fromEmail,
			'smtp.fromName': formString(data, 'smtp.fromName'),
			'smtp.replyTo': replyTo,
			'auth.requireEmailVerification': requireVerification ? 'true' : 'false'
		};

		if (data.get('clearSmtpPassword')) {
			values['smtp.password'] = '';
		} else {
			const password = String(data.get('smtp.password') ?? '');
			if (password) values['smtp.password'] = password;
		}

		await updateSettings(values);
		await loadSettings(true);
		resetEmailTransport();

		logActivity({
			userId: locals.user?.id,
			action: 'admin.email.smtp',
			message: 'Updated SMTP settings',
			metadata: { enabled, host, port }
		});

		return { success: 'SMTP settings saved.' };
	},

	saveEvents: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const values: Partial<Record<SettingKey, string>> = {};

		for (const event of EMAIL_EVENTS) {
			values[event.key] = formBoolean(data, event.key) ? 'true' : 'false';
		}

		await updateSettings(values);
		await loadSettings(true);

		logActivity({
			userId: locals.user?.id,
			action: 'admin.email.events',
			message: 'Updated email notification events',
			metadata: { events: Object.keys(values) }
		});

		return { success: 'Email events saved.' };
	},

	saveTemplate: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();

		const key = formString(data, 'key');
		if (!findEmailTemplate(key)) {
			return fail(400, { error: 'Choose a valid email template.' });
		}

		const subject = formString(data, 'subject');
		const body = String(data.get('body') ?? '').trim();

		if (!body) {
			return fail(400, { error: 'The template body cannot be empty.' });
		}
		if (key !== 'layout' && !subject) {
			return fail(400, { error: 'The subject line cannot be empty.' });
		}

		try {
			await saveEmailTemplate(key, subject, body);
		} catch (cause) {
			return fail(400, {
				error:
					cause instanceof Error
						? cause.message
						: 'The template file could not be written. Check that the data directory is writable.'
			});
		}

		logActivity({
			userId: locals.user?.id,
			action: 'admin.email.template',
			message: `Updated email template "${key}"`
		});

		return { success: 'Email template saved.' };
	},

	resetTemplate: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const key = formString(data, 'key');

		if (!findEmailTemplate(key)) {
			return fail(400, { error: 'Choose a valid email template.' });
		}

		try {
			await resetEmailTemplate(key);
		} catch (cause) {
			return fail(400, {
				error:
					cause instanceof Error
						? cause.message
						: 'The template file could not be written. Check that the data directory is writable.'
			});
		}

		logActivity({
			userId: locals.user?.id,
			action: 'admin.email.template.reset',
			message: `Reset email template "${key}"`
		});

		return { success: 'Template restored to its default.' };
	},

	test: async ({ locals, request }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const to = formString(data, 'to');
		const templateKey = formString(data, 'templateKey');

		if (!emailPattern.test(to)) {
			return fail(400, { error: 'Enter a valid recipient email address.' });
		}
		if (templateKey && !findEmailTemplate(templateKey)) {
			return fail(400, { error: 'Choose a valid email template.' });
		}

		const result = await sendTestEmail(to, templateKey || undefined);

		if (!result.sent) {
			return fail(400, { error: result.reason ?? 'The test email could not be sent.' });
		}

		logActivity({
			userId: locals.user?.id,
			action: 'admin.email.test',
			message: `Sent a test email to ${to}`,
			metadata: { template: templateKey || 'default' }
		});

		return { success: `Test email sent to ${to}.` };
	},

	verify: async ({ locals }) => {
		requireAdmin(locals);

		const result = await verifySmtpConnection();

		if (!result.sent) {
			return fail(400, { error: result.reason ?? 'The SMTP connection could not be verified.' });
		}

		return { success: 'SMTP connection verified successfully.' };
	}
};
