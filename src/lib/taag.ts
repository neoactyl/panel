const LOGO = [
	'███╗   ██╗███████╗ ██████╗  █████╗  ██████╗████████╗██╗   ██╗██╗     ',
	'████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝╚██╗ ██╔╝██║     ',
	'██╔██╗ ██║█████╗  ██║   ██║███████║██║        ██║    ╚████╔╝ ██║     ',
	'██║╚██╗██║██╔══╝  ██║   ██║██╔══██║██║        ██║     ╚██╔╝  ██║     ',
	'██║ ╚████║███████╗╚██████╔╝██║  ██║╚██████╗   ██║      ██║   ███████╗',
	'╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═╝      ╚═╝   ╚══════╝'
];

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// Top-to-bottom gradient: bright mint green -> deep green.
const from = [140, 255, 175];
const to = [0, 165, 85];

const rgb = (line: number) => {
	const t = line / (LOGO.length - 1);
	const [r, g, b] = from.map((start, i) => Math.round(start + (to[i] - start) * t));
	return `\x1b[38;2;${r};${g};${b}m`;
};

export const createBanner = (tagline = 'Game server panel') =>
	[
		'',
		...LOGO.map((line, index) => `${rgb(index)}${line}${RESET}`),
		`${DIM}${tagline}${RESET}`,
		''
	].join('\n');