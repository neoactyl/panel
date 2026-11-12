import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/auth.schema.ts';
import { notificationLog } from '#lib/server/db/ops.ts';
import {
	emailEventForNotificationKind,
	type EmailEventKey
} from '#lib/server/email/events.ts';
import {
	isEmailReady,
	sendEventEmail,
	sendTemplateEmail
} from '#lib/server/email/mailer.ts';
import { getEmailBaseVariables } from '#lib/server/email/templates.ts';

export type NotificationEmail = {
	/** Override the event mapped from the notification kind. */
	event?: EmailEventKey;
	/** Render a specific template instead of an event template. */
	templateKey?: string;
	/** Extra variables merged into the template. */
	variables?: Record<string, unknown>;
};

export type UserNotification = {
	userId: string;
	kind: string;
	title: string;
	body?: string;
	url?: string;
	/** Set to false to store the notification without sending an email. */
	email?: false | NotificationEmail;
};

const absoluteUrl = (path: string | undefined) => {
	const base = getEmailBaseVariables().panelUrl;
	if (!path) return base;
	if (/^https?:\/\//i.test(path)) return path;
	if (!base) return path;
	return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

const deliverEmail = async (notification: UserNotification) => {
	if (notification.email === false || !isEmailReady()) return;

	const event =
		notification.email?.event ?? emailEventForNotificationKind(notification.kind)?.key;
	const templateKey = notification.email?.templateKey;

	if (!event && !templateKey) return;

	const recipient = await db
		.select({ email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, notification.userId))
		.get();

	if (!recipient?.email) return;

	const variables: Record<string, unknown> = {
		userName: recipient.name,
		userEmail: recipient.email,
		title: notification.title,
		body: notification.body ?? '',
		actionUrl: absoluteUrl(notification.url),
		...notification.email?.variables
	};

	if (event) {
		await sendEventEmail(event, { to: recipient.email, variables });
	} else if (templateKey) {
		await sendTemplateEmail(templateKey, { to: recipient.email, variables });
	}
};

export const notifyUser = async (notification: UserNotification) => {
	await db.insert(notificationLog).values({
		userId: notification.userId,
		kind: notification.kind,
		title: notification.title,
		body: notification.body ?? '',
		url: notification.url,
		createdAt: new Date()
	});

	// Deliver in the background so a slow SMTP server cannot block the caller
	// (sign-up, password reset, or the renewal worker).
	void deliverEmail(notification).catch((cause) => {
		// Email delivery must never prevent the in-app notification from being stored.
		console.error('Unable to deliver a notification email.', cause);
	});
};
