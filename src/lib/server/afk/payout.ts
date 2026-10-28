export type AfkPayoutInput = {
	pendingSeconds: number;
	earnedToday: number;
	dailyCapMinutes: number;
	coinsPerMinute: number;
	minimumPayoutMinutes: number;
};

export type AfkPayoutResult = {
	pendingSeconds: number;
	earnedToday: number;
	payoutMinutes: number;
	awarded: number;
	capped: boolean;
};

/**
 * Converts accumulated whole minutes into credits. Kept pure so the reward
 * caps and minimum payout behaviour can be tested without a database.
 */
export const computeAfkPayout = (input: AfkPayoutInput): AfkPayoutResult => {
	const pending = Math.max(0, Math.floor(input.pendingSeconds));
	const earned = Math.max(0, Math.floor(input.earnedToday));
	const cap = Math.max(0, Math.floor(input.dailyCapMinutes));
	const perMinute = Math.max(0, Math.floor(input.coinsPerMinute));
	const minimum = Math.max(1, Math.floor(input.minimumPayoutMinutes));

	if (perMinute <= 0) {
		return {
			pendingSeconds: pending,
			earnedToday: earned,
			payoutMinutes: 0,
			awarded: 0,
			capped: false
		};
	}

	if (cap > 0 && earned >= cap) {
		return {
			pendingSeconds: 0,
			earnedToday: earned,
			payoutMinutes: 0,
			awarded: 0,
			capped: true
		};
	}

	const availableMinutes = Math.floor(pending / 60);
	const remainingMinutes = cap <= 0 ? availableMinutes : Math.max(0, cap - earned);
	const payoutMinutes = Math.min(availableMinutes, remainingMinutes);
	// Pay the final, smaller block so a minimum larger than the remaining daily
	// allowance does not strand credits at the cap.
	const finalPartialBlock =
		cap > 0 && payoutMinutes > 0 && payoutMinutes === remainingMinutes;

	if (payoutMinutes <= 0 || (payoutMinutes < minimum && !finalPartialBlock)) {
		return {
			pendingSeconds: cap > 0 && remainingMinutes <= 0 ? 0 : pending,
			earnedToday: earned,
			payoutMinutes: 0,
			awarded: 0,
			capped: cap > 0 && remainingMinutes <= 0
		};
	}

	const earnedToday = earned + payoutMinutes;
	const awarded = payoutMinutes * perMinute;

	return {
		pendingSeconds: pending - payoutMinutes * 60,
		earnedToday,
		payoutMinutes,
		awarded,
		capped: cap > 0 && earnedToday >= cap
	};
};
