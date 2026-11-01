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
const FROM = { r: 140, g: 255, b: 175 };
const TO = { r: 0, g: 165, b: 85 };

const rgb = (line: number) => {
	const t = line / (LOGO.length - 1);
	const mix = (start: number, end: number) => Math.round(start + (end - start) * t);
	return `\x1b[38;2;${mix(FROM.r, TO.r)};${mix(FROM.g, TO.g)};${mix(FROM.b, TO.b)}m`;
};

export const createBanner = (tagline = 'Game server panel') =>
	[
		'',
		...LOGO.map((line, index) => `${rgb(index)}${line}${RESET}`),
		`${DIM}${tagline}${RESET}`,
		''
	].join('\n');