import type { SettingKey } from '#lib/server/config/settings.ts';

export type EmailEventDefinition = {
	/** Boolean setting that enables or disables this email. */
	key: SettingKey;
	/** Template used to render the email. */
	templateKey: string;
	label: string;
	description: string;
	/** Notification kinds that map to this email automatically. */
	notificationKinds?: readonly string[];
};

export const EMAIL_EVENTS = [
	{
		key: 'email.events.emailVerification',
		templateKey: 'email-verification',
		label: 'Email verification',
		description: 'Sent when a user registers or asks for a new verification link.'
	},
	{
		key: 'email.events.passwordReset',
		templateKey: 'password-reset',
		label: 'Password reset',
		description: 'Sent when a user requests a password reset link.'
	},
	{
		key: 'email.events.serverExpiringSoon',
		templateKey: 'server-expiring-soon',
		label: 'Server expiring soon',
		description: 'Sent while a server approaches its renewal date.',
		notificationKinds: ['billing.due']
	},
	{
		key: 'email.events.serverSuspended',
		templateKey: 'server-suspended',
		label: 'Server suspended',
		description: 'Sent when a server expires or a renewal payment fails.',
		notificationKinds: ['billing.suspended']
	},
	{
		key: 'email.events.serverDeletionWarning',
		templateKey: 'server-deletion-warning',
		label: 'Deletion warning',
		description: 'Sent shortly before a suspended server is permanently deleted.',
		notificationKinds: ['billing.deletionWarning']
	},
	{
		key: 'email.events.serverDeleted',
		templateKey: 'server-deleted',
		label: 'Server deleted',
		description: 'Sent after a server is permanently deleted for non-payment.',
		notificationKinds: ['billing.deleted']
	},
	{
		key: 'email.events.renewalFailed',
		templateKey: 'renewal-failed',
		label: 'Renewal payment failed',
		description: 'Sent when an automatic renewal cannot be charged.',
		notificationKinds: ['billing.failed']
	},
	{
		key: 'email.events.serverRenewed',
		templateKey: 'server-renewed',
		label: 'Server renewed',
		description: 'Sent after a successful manual or automatic renewal.',
		notificationKinds: ['billing.renewed']
	},
	{
		key: 'email.events.topup',
		templateKey: 'topup',
		label: 'Successful top-up',
		description: 'Sent after a Stripe credit purchase is fulfilled.',
		notificationKinds: ['credits.topup']
	},
	{
		key: 'email.events.giftReceived',
		templateKey: 'gift-received',
		label: 'Gift received',
		description: 'Sent when another user gifts credits.',
		notificationKinds: ['gift']
	},
	{
		key: 'email.events.voucherRedeemed',
		templateKey: 'voucher-redeemed',
		label: 'Voucher redeemed',
		description: 'Sent when a voucher is applied to an account.',
		notificationKinds: ['voucher']
	},
	{
		key: 'email.events.referralReward',
		templateKey: 'referral-reward',
		label: 'Referral reward',
		description: 'Sent when a referred user completes registration.',
		notificationKinds: ['referral']
	},
	{
		key: 'email.events.inviteReward',
		templateKey: 'invite-reward',
		label: 'Discord invite reward',
		description: 'Sent when Discord invite rewards are claimed.',
		notificationKinds: ['discord.invites']
	},
	{
		key: 'email.events.j4rReward',
		templateKey: 'j4r-reward',
		label: 'Discord J4R reward',
		description: 'Sent when a join-for-resources reward is claimed.',
		notificationKinds: ['discord.j4r']
	}
] as const satisfies readonly EmailEventDefinition[];

export type EmailEventKey = (typeof EMAIL_EVENTS)[number]['key'];

export const findEmailEvent = (key: string) =>
	EMAIL_EVENTS.find((event) => event.key === key);

export const emailEventForNotificationKind = (kind: string) =>
	EMAIL_EVENTS.find((event) =>
		(event as EmailEventDefinition).notificationKinds?.includes(kind)
	);
