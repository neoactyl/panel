import { db } from '#lib/server/db/index.ts';
import { notificationLog } from '#lib/server/db/ops.ts';

export type UserNotification = {
	userId: string;
	kind: string;
	title: string;
	body?: string;
	url?: string;
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
};
