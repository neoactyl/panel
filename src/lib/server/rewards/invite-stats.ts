/**
 * Pure invite-tracking rules shared by the Discord `/invites` command, the panel
 * reward page, and the reward claim flow. Kept free of database imports so the
 * anti-alt and "no rejoin reclaim" rules can be unit tested directly.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The subset of an `invited_users` row the rules care about. */
export type TrackedInvite = {
	discordId: string;
	joinedAt: Date | null;
	stillInServer: boolean;
	counted: boolean;
	rewardedAt: Date | null;
};

export type InviteSummary = {
	/** Every tracked invitee, whether or not it qualified. */
	total: number;
	/** Invites that passed the anti-alt account-age gate. */
	valid: number;
	/** Valid invites whose member is still in the server. */
	active: number;
	/** Valid invites whose member has left. */
	left: number;
	/** Invitees rejected because their account was too new (anti-alt). */
	pending: number;
	/** Valid invites that have already paid out. */
	rewarded: number;
	/** Valid, unpaid invites available to claim right now. */
	claimable: number;
};

/**
 * Anti-alt gate: an invite only counts when the invited account already existed
 * for at least `minimumAccountAgeDays` at the moment it joined.
 */
export const isInviteCounted = (
	joinedAt: Date,
	accountCreatedAt: Date,
	minimumAccountAgeDays: number
): boolean => {
	const minimumAge = Math.max(0, minimumAccountAgeDays) * MS_PER_DAY;

	return joinedAt.getTime() - accountCreatedAt.getTime() >= minimumAge;
};

/**
 * Whether a stored invite can be paid out right now. Because `rewardedAt` is set
 * once and never cleared, a member who leaves and rejoins can never make an
 * already rewarded invite claimable again.
 */
export const isInviteClaimable = (
	invite: TrackedInvite,
	requireStillMember: boolean
): boolean =>
	invite.counted &&
	invite.rewardedAt === null &&
	(!requireStillMember || invite.stillInServer);

/** Preferred display order for invite lists: most recent join first. */
export const byRecency = (a: TrackedInvite, b: TrackedInvite): number =>
	(b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0);

export const summarizeInvites = (
	invites: TrackedInvite[],
	{ requireStillMember }: { requireStillMember: boolean }
): InviteSummary => {
	const valid = invites.filter((invite) => invite.counted);
	const active = valid.filter((invite) => invite.stillInServer);

	return {
		total: invites.length,
		valid: valid.length,
		active: active.length,
		left: valid.length - active.length,
		pending: invites.length - valid.length,
		rewarded: valid.filter((invite) => invite.rewardedAt !== null).length,
		claimable: valid.filter((invite) => isInviteClaimable(invite, requireStillMember)).length
	};
};

