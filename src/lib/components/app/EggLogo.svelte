<script lang="ts">
	import IconPackage from '@tabler/icons-svelte/icons/package';

	let { name }: { name: string } = $props();

	const favicon = (domain: string) =>
		`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;

	const logos: Record<string, string> = {
		fabric: favicon('fabricmc.net'),
		'liteloader bedrock dedicated server': favicon('minecraft.net'),
		krypton: 'https://github.com/astei.png?size=64',
		'attack of the b-team': favicon('feed-the-beast.com'),
		glowstone: favicon('glowstone.net'),
		paper: favicon('papermc.io'),
		arclight: 'https://github.com/IzzelAliz.png?size=64',
		canvasmc: favicon('canvasmc.io'),
		hexxit: favicon('feed-the-beast.com'),
		limbo: 'https://github.com/LOOHP.png?size=64',
		folia: favicon('papermc.io'),
		neoforge: favicon('neoforged.net'),
		nanolimbo: 'https://github.com/Nan1t.png?size=64',
		powernukkitx: 'https://github.com/PowerNukkitX.png?size=64',
		'forge enhanced': favicon('minecraftforge.net'),
		mohistmc: favicon('mohistmc.com'),
		magma: favicon('magmafoundation.org'),
		cuberite: favicon('cuberite.org'),
		'ftb server': favicon('feed-the-beast.com'),
		blightfall: favicon('feed-the-beast.com'),
		'modrinth generic': favicon('modrinth.com'),
		nukkit: favicon('cloudburstmc.org'),
		'curseforge generic': favicon('curseforge.com'),
		levilamina: 'https://github.com/LiteLDev.png?size=64',
		pocketminemp: favicon('pmmp.io')
	};

	let failed = $state(false);
	let src = $derived(logos[name.toLowerCase()] ?? null);

	$effect(() => {
		name;
		failed = false;
	});
</script>

{#if src && !failed}
	<img
		{src}
		alt=""
		loading="lazy"
		class="h-5 w-5 shrink-0 object-contain"
		onerror={() => (failed = true)}
	/>
{:else}
	<IconPackage class="h-4 w-4 shrink-0 text-white/40" />
{/if}
