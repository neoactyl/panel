import { getBranding, getSetting } from '#lib/server/config/settings.ts';

export type EmailTemplateVariable = {
	key: string;
	description: string;
	sample: string;
};

export type EmailTemplateDefinition = {
	key: string;
	name: string;
	description: string;
	subject: string;
	body: string;
	variables: EmailTemplateVariable[];
};

const button = (label: string, variable = 'actionUrl') =>
	`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
	<tr>
		<td style="background:#6366f1;">
			<a href="{{${variable}}}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.02em;">${label}</a>
		</td>
	</tr>
</table>`;

const fallbackLink = (variable = 'actionUrl') =>
	`<p style="margin:18px 0 0;color:#737373;font-size:11px;line-height:1.6;">
		If the button does not work, copy and paste this link into your browser:<br />
		<span style="color:#a5b4fc;word-break:break-all;">{{${variable}}}</span>
	</p>`;

const commonVariables: EmailTemplateVariable[] = [
	{ key: 'brandName', description: 'Your panel name', sample: 'Neoactyl' },
	{ key: 'panelUrl', description: 'Public URL of your panel', sample: 'https://panel.example.com' },
	{ key: 'userName', description: 'Recipient name', sample: 'Alex' },
	{ key: 'userEmail', description: 'Recipient email address', sample: 'alex@example.com' },
	{ key: 'year', description: 'Current year', sample: String(new Date().getFullYear()) }
];

const notificationVariables: EmailTemplateVariable[] = [
	...commonVariables,
	{ key: 'title', description: 'Notification title', sample: 'Server renewal due soon' },
	{ key: 'body', description: 'Notification body text', sample: 'Your server renews tomorrow.' },
	{ key: 'actionUrl', description: 'Absolute link to the relevant page', sample: 'https://panel.example.com/server' }
];

const serverVariables: EmailTemplateVariable[] = [
	...commonVariables,
	{ key: 'serverId', description: 'Panel identifier of the server', sample: 'a1b2c3d4' },
	{ key: 'actionUrl', description: 'Absolute link to the server page', sample: 'https://panel.example.com/server' }
];

export const DEFAULT_EMAIL_LAYOUT_KEY = 'layout';

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
	{
		key: DEFAULT_EMAIL_LAYOUT_KEY,
		name: 'Base layout',
		description:
			'Wraps every outgoing email. The {{content}} placeholder is replaced with the message body of the selected template.',
		subject: '',
		body: `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="dark" />
		<title>{{subject}}</title>
	</head>
	<body style="margin:0;padding:0;background:#0d0d0d;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;">
			<tr>
				<td align="center" style="padding:32px 16px;">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1a1a1a;border:1px solid #2a2a2a;">
						<tr>
							<td style="padding:22px 28px;border-bottom:1px solid #2a2a2a;">
								<span style="font-size:16px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">{{brandName}}</span>
							</td>
						</tr>
						<tr>
							<td style="padding:28px;color:#d4d4d4;font-size:14px;line-height:1.7;">
								{{content}}
							</td>
						</tr>
						<tr>
							<td style="padding:18px 28px;border-top:1px solid #2a2a2a;color:#737373;font-size:11px;line-height:1.6;">
								Sent by {{brandName}} · <a href="{{panelUrl}}" style="color:#a5b4fc;text-decoration:none;">{{panelUrl}}</a><br />
								&copy; {{year}} {{brandName}}. All rights reserved.
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`,
		variables: [
			{ key: 'content', description: 'Rendered message body (do not escape)', sample: '<p>Hello</p>' },
			{ key: 'subject', description: 'Rendered subject line', sample: 'Welcome to Neoactyl' },
			...commonVariables
		]
	},
	{
		key: 'email-verification',
		name: 'Email verification',
		description: 'Sent when a user registers or requests a new verification link.',
		subject: 'Verify your email for {{brandName}}',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Verify your email</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Thanks for creating an account on {{brandName}}. Confirm your email address to finish setting up your account.</p>
${button('Verify email', 'verificationUrl')}
<p style="margin:0;color:#a3a3a3;font-size:12px;">This link expires in {{expiresIn}}. If you did not create this account, you can safely ignore this message.</p>
${fallbackLink('verificationUrl')}`,
		variables: [
			...commonVariables,
			{ key: 'verificationUrl', description: 'One-time verification link', sample: 'https://panel.example.com/api/auth/verify-email?token=...' },
			{ key: 'expiresIn', description: 'How long the link is valid', sample: '1 hour' }
		]
	},
	{
		key: 'password-reset',
		name: 'Password reset',
		description: 'Sent when a user requests a password reset link.',
		subject: 'Reset your {{brandName}} password',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Reset your password</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">We received a request to reset the password for your {{brandName}} account. Choose a new password using the button below.</p>
${button('Reset password', 'resetUrl')}
<p style="margin:0;color:#a3a3a3;font-size:12px;">This link expires in {{expiresIn}}. If you did not ask for a reset, no action is needed.</p>
${fallbackLink('resetUrl')}`,
		variables: [
			...commonVariables,
			{ key: 'resetUrl', description: 'One-time password reset link', sample: 'https://panel.example.com/api/auth/reset-password?token=...' },
			{ key: 'expiresIn', description: 'How long the link is valid', sample: '1 hour' }
		]
	},
	{
		key: 'server-expiring-soon',
		name: 'Server expiring soon',
		description: 'Sent when a server is close to its renewal date.',
		subject: 'Your server renews soon',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Server renewal due soon</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Server <strong style="color:#ffffff;">{{serverId}}</strong> renews on {{renewalDate}} for {{amount}}. Auto-renew is off, so renew within {{timeLeft}} to keep it online.</p>
${button('Manage server', 'actionUrl')}
<p style="margin:0;color:#a3a3a3;font-size:12px;">If the renewal is not paid, the server will be suspended and may be deleted later.</p>
${fallbackLink('actionUrl')}`,
		variables: [
			...serverVariables,
			{ key: 'renewalDate', description: 'Next renewal date', sample: '12 May 2026' },
			{ key: 'amount', description: 'Renewal price with currency', sample: '250 Credits' },
			{ key: 'timeLeft', description: 'Time remaining before suspension', sample: '23 hours' }
		]
	},
	{
		key: 'server-suspended',
		name: 'Server suspended',
		description: 'Sent when a server expires or its renewal payment fails.',
		subject: 'Your server has been suspended',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Server suspended</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Server <strong style="color:#ffffff;">{{serverId}}</strong> was suspended: {{reason}}</p>
<p style="margin:0 0 14px;">Renew it before <strong style="color:#ffffff;">{{deleteDate}}</strong> or it will be deleted automatically.</p>
${button('Renew server', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...serverVariables,
			{ key: 'reason', description: 'Why the server was suspended', sample: 'the renewal payment failed' },
			{ key: 'deleteDate', description: 'Scheduled deletion date', sample: '19 May 2026' }
		]
	},
	{
		key: 'server-deletion-warning',
		name: 'Deletion warning',
		description: 'Sent shortly before a suspended server is permanently deleted.',
		subject: 'Your server will be deleted soon',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Final warning: server deletion</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Server <strong style="color:#ffffff;">{{serverId}}</strong> is scheduled for permanent deletion on <strong style="color:#ffffff;">{{deleteDate}}</strong>.</p>
<p style="margin:0 0 14px;">Renew the server now to keep your files and configuration. Once it is deleted, the data cannot be recovered.</p>
${button('Renew now', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...serverVariables,
			{ key: 'deleteDate', description: 'Scheduled deletion date', sample: '19 May 2026' }
		]
	},
	{
		key: 'server-deleted',
		name: 'Server deleted',
		description: 'Sent after a server is permanently deleted for non-payment.',
		subject: 'Your server has been deleted',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Server deleted</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Server <strong style="color:#ffffff;">{{serverId}}</strong> was permanently deleted because its renewal payment was not received in time.</p>
<p style="margin:0 0 14px;">You can create a new server at any time from the storefront.</p>
${button('Visit storefront', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: serverVariables
	},
	{
		key: 'renewal-failed',
		name: 'Renewal payment failed',
		description: 'Sent when an automatic renewal cannot be charged.',
		subject: 'Server renewal payment failed',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Renewal payment failed</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">We could not renew server <strong style="color:#ffffff;">{{serverId}}</strong>. {{reason}}</p>
<p style="margin:0 0 14px;">The renewal costs {{amount}}. Add credits before {{renewalDate}} to keep the server online.</p>
${button('Add credits', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...serverVariables,
			{ key: 'reason', description: 'Failure reason', sample: 'Not enough credits.' },
			{ key: 'amount', description: 'Renewal price with currency', sample: '250 Credits' },
			{ key: 'renewalDate', description: 'Renewal date', sample: '12 May 2026' }
		]
	},
	{
		key: 'server-renewed',
		name: 'Server renewed',
		description: 'Sent after a successful manual or automatic renewal.',
		subject: 'Your server has been renewed',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Server renewed</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">Server <strong style="color:#ffffff;">{{serverId}}</strong> was renewed for another {{intervalDays}} days.</p>
${button('Open server', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...serverVariables,
			{ key: 'intervalDays', description: 'Renewal interval in days', sample: '30' }
		]
	},
	{
		key: 'topup',
		name: 'Successful top-up',
		description: 'Sent after a Stripe credit top-up is fulfilled.',
		subject: 'Your {{brandName}} top-up succeeded',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Credits added</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;"><strong style="color:#ffffff;">{{credits}}</strong> credits were added to your balance after a successful payment of {{amount}}.</p>
<p style="margin:0 0 14px;">Your new balance is <strong style="color:#ffffff;">{{balance}}</strong>.</p>
${button('View credits', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...commonVariables,
			{ key: 'credits', description: 'Credits purchased (formatted)', sample: '2,500' },
			{ key: 'amount', description: 'Amount paid (formatted)', sample: '$25.00 USD' },
			{ key: 'balance', description: 'New balance (formatted)', sample: '3,120 Credits' },
			{ key: 'actionUrl', description: 'Absolute link to the credits page', sample: 'https://panel.example.com/credits' }
		]
	},
	{
		key: 'gift-received',
		name: 'Gift received',
		description: 'Sent when another user gifts credits to an account.',
		subject: 'You received credits from {{brandName}}',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">You received credits</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;"><strong style="color:#ffffff;">{{amount}}</strong> credits were gifted to your account.</p>
<p style="margin:0 0 14px;">Your new balance is <strong style="color:#ffffff;">{{balance}}</strong>.</p>
${button('View credits', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: [
			...commonVariables,
			{ key: 'amount', description: 'Gift amount (formatted)', sample: '150 Credits' },
			{ key: 'balance', description: 'New balance (formatted)', sample: '420 Credits' },
			{ key: 'actionUrl', description: 'Absolute link to the credits page', sample: 'https://panel.example.com/credits' }
		]
	},
	{
		key: 'voucher-redeemed',
		name: 'Voucher redeemed',
		description: 'Sent when a voucher is applied to an account.',
		subject: 'Voucher redeemed successfully',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Voucher redeemed</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">{{body}}</p>
${button('View credits', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: notificationVariables
	},
	{
		key: 'referral-reward',
		name: 'Referral reward',
		description: 'Sent when a referred user completes registration.',
		subject: 'You earned a referral reward',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Referral reward earned</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">{{body}}</p>
${button('View invites', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: notificationVariables
	},
	{
		key: 'invite-reward',
		name: 'Discord invite reward',
		description: 'Sent when Discord invite rewards are claimed.',
		subject: 'Discord invite reward claimed',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Invite reward claimed</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">{{body}}</p>
${button('View invites', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: notificationVariables
	},
	{
		key: 'j4r-reward',
		name: 'Discord J4R reward',
		description: 'Sent when a join-for-resources reward is claimed.',
		subject: 'Discord reward claimed',
		body: `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#ffffff;">Discord reward claimed</h1>
<p style="margin:0 0 14px;">Hi {{userName}},</p>
<p style="margin:0 0 14px;">{{body}}</p>
${button('View rewards', 'actionUrl')}
${fallbackLink('actionUrl')}`,
		variables: notificationVariables
	}
];

export const EMAIL_TEMPLATE_KEYS = DEFAULT_EMAIL_TEMPLATES.map((template) => template.key);

export const findEmailTemplate = (key: string) =>
	DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key);

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const asText = (value: unknown) => {
	if (value === null || value === undefined) return '';
	return String(value);
};

/** Collapse any value into a single safe header line (no CR/LF or control chars). */
const toHeaderLine = (value: unknown) =>
	asText(value)
		.replace(/[\u0000-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Replace placeholders for plain-text contexts like the subject line. Unlike
 * `renderTemplateString`, values are not HTML-escaped, so entities such as
 * `&amp;` do not leak into the delivered subject.
 */
export const renderSubjectString = (
	template: string,
	variables: Record<string, unknown>
) =>
	toHeaderLine(
		template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) =>
			asText(variables[key])
		)
	);

/** Replace `{{variable}}` placeholders. Only `{{content}}` is inserted raw. */
export const renderTemplateString = (
	template: string,
	variables: Record<string, unknown>,
	options: { allowRawContent?: boolean } = {}
) =>
	template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
		if (options.allowRawContent && key === 'content') {
			return asText(variables.content);
		}

		return escapeHtml(asText(variables[key]));
	});

export const getEmailBaseVariables = (): Record<string, string> => {
	const branding = getBranding();
	const configured =
		process.env.BETTER_AUTH_URL ||
		process.env.ORIGIN ||
		getSetting('panel.url').trim() ||
		'';

	return {
		brandName: branding.name,
		brandDescription: branding.description,
		brandLogo: branding.logo,
		panelUrl: configured.replace(/\/+$/, ''),
		year: String(new Date().getFullYear())
	};
};

export type RenderEmailInput = {
	layout: { subject: string; body: string };
	template: { subject: string; body: string };
	variables: Record<string, unknown>;
};

export const renderEmail = ({ layout, template, variables }: RenderEmailInput) => {
	const base = getEmailBaseVariables();
	const merged = { ...base, ...variables };
	const subject = renderSubjectString(template.subject, merged);
	const content = renderTemplateString(template.body, merged);
	// Pass the raw subject into the layout so `{{subject}}` is escaped exactly
	// once by `renderTemplateString` (for the HTML <title>).
	const html = renderTemplateString(
		layout.body,
		{ ...merged, subject, content },
		{ allowRawContent: true }
	);

	return { subject, html };
};
