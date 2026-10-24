<script lang="ts">
	import type { Icon as TablerIcon } from '@tabler/icons-svelte';
	import IconActivity from '@tabler/icons-svelte/icons/activity';
	import IconArchive from '@tabler/icons-svelte/icons/archive';
	import IconBolt from '@tabler/icons-svelte/icons/bolt';
	import IconBook from '@tabler/icons-svelte/icons/book';
	import IconChartBar from '@tabler/icons-svelte/icons/chart-bar';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import IconDatabase from '@tabler/icons-svelte/icons/database';
	import IconFile from '@tabler/icons-svelte/icons/file';
	import IconGlobe from '@tabler/icons-svelte/icons/globe';
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import IconPuzzle from '@tabler/icons-svelte/icons/puzzle';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconTerminal from '@tabler/icons-svelte/icons/terminal-2';
	import IconUsers from '@tabler/icons-svelte/icons/users';

	const icons: Record<string, TablerIcon> = {
		activity: IconActivity,
		archive: IconArchive,
		bolt: IconBolt,
		book: IconBook,
		chart: IconChartBar,
		clock: IconClock,
		database: IconDatabase,
		file: IconFile,
		globe: IconGlobe,
		package: IconPackage,
		puzzle: IconPuzzle,
		server: IconServer,
		settings: IconSettings,
		terminal: IconTerminal,
		users: IconUsers
	};

	let { name = 'puzzle', class: klass = 'size-4' }: { name?: string; class?: string } = $props();

	const Icon = $derived(icons[name] ?? IconPuzzle);
</script>

<Icon class={klass} />
