let message = $state('');
let timer: ReturnType<typeof setTimeout> | null = null;

export const feedback = {
	get message() {
		return message;
	},
	show(value: string) {
		message = value;

		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (message = ''), 2600);
	}
};
