<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import IconFolder from '@tabler/icons-svelte/icons/folder';
	import IconFolderOpen from '@tabler/icons-svelte/icons/folder-open';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconFile from '@tabler/icons-svelte/icons/file';
	import IconFileZip from '@tabler/icons-svelte/icons/file-zip';
	import IconFileCode from '@tabler/icons-svelte/icons/file-code';
	import IconFileSettings from '@tabler/icons-svelte/icons/file-settings';
	import IconFileText from '@tabler/icons-svelte/icons/file-text';
	import IconBraces from '@tabler/icons-svelte/icons/braces';
	import IconPhoto from '@tabler/icons-svelte/icons/photo';
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import IconPlus from '@tabler/icons-svelte/icons/plus';
	import IconUpload from '@tabler/icons-svelte/icons/upload';
	import IconFolderPlus from '@tabler/icons-svelte/icons/folder-plus';
	import IconDownload from '@tabler/icons-svelte/icons/download';
	import IconDots from '@tabler/icons-svelte/icons/dots-vertical';
	import IconCopy from '@tabler/icons-svelte/icons/copy';
	import IconClipboard from '@tabler/icons-svelte/icons/clipboard';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconArchive from '@tabler/icons-svelte/icons/archive';
	import IconPencil from '@tabler/icons-svelte/icons/pencil';
	import IconEye from '@tabler/icons-svelte/icons/eye';
	import IconDeviceFloppy from '@tabler/icons-svelte/icons/device-floppy';
	import Modal from '#lib/components/app/Modal.svelte';
	import { adapter } from '#lib/adapter/client.ts';
	import { FILES_ROOT } from '#lib/adapter/sdk.ts';
	import { getServerPanel } from '#lib/panel/state.svelte.ts';
	import { usageColor } from '#lib/client/usage-color.ts';
	import type { FileAction, FileEntry } from '#lib/adapter/sdk.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const panel = getServerPanel();
	const server = $derived(data.server);
	const fileCapabilities = $derived(data.capabilities.files);

	let tree = $state<Record<string, FileEntry[]>>(untrack(() => structuredClone(data.fileSystem.tree)));
	let path = $state(FILES_ROOT);
	let selected = $state<string | null>(null);
	let clipboard = $state<{ file: FileEntry; from: string } | null>(null);
	let menu = $state<{ x: number; y: number; file: FileEntry } | null>(null);

	let editor = $state<{ file: FileEntry; dir: string } | null>(null);
	let draft = $state('');
	let preview = $state(false);
	let editorLoading = $state(false);
	let editorRequest = 0;
	let uploadInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let folderOpen = $state(false);
	let folderNameInput = $state('');
	let folderError = $state('');
	let creatingFolder = $state(false);

	const files = $derived(tree[path] ?? []);

	const refresh = async () => {
		const entries = await adapter.listFiles(server.id, path);
		tree = { ...tree, [path]: structuredClone(entries) };
	};

	const loadDirectory = async (directory: string) => {
		const entries = await adapter.listFiles(server.id, directory);
		tree = { ...tree, [directory]: structuredClone(entries) };
	};

	const crumbs = $derived.by(() => {
		const rel = path === FILES_ROOT ? [] : path.slice(FILES_ROOT.length + 1).split('/');
		const list = [{ label: 'container', path: FILES_ROOT }];
		let acc = FILES_ROOT;
		for (const part of rel) {
			acc += `/${part}`;
			list.push({ label: part, path: acc });
		}
		return list;
	});

	const navigate = async (next: string) => {
		try {
			if (!tree[next]) await loadDirectory(next);
			path = next;
			selected = null;
			menu = null;
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not open directory.');
		}
	};

	const extname = (name: string) => {
		const lower = name.toLowerCase();
		if (lower.endsWith('.tar.gz')) return 'tar.gz';
		const index = lower.lastIndexOf('.');
		return index >= 0 ? lower.slice(index + 1) : '';
	};

	const ARCHIVE_EXTENSIONS = new Set(['zip', 'gz', 'tar', 'tgz', 'rar', '7z', 'tar.gz']);
	const TEXT_EXTENSIONS = new Set([
		'txt',
		'md',
		'json',
		'yml',
		'yaml',
		'properties',
		'sh',
		'log',
		'cfg',
		'conf',
		'ini',
		'toml',
		'xml',
		'java',
		'js',
		'ts',
		'sql',
		'mcfunction',
		'json5',
		'env',
		'gradle',
		'bat',
		'ps1',
		'html',
		'css',
		'lua',
		'py',
		'rb',
		'go',
		'rs',
		'c',
		'cpp',
		'h'
	]);

	const isArchive = (name: string) => ARCHIVE_EXTENSIONS.has(extname(name));
	const isText = (file: FileEntry) =>
		file.type === 'file' && (file.content !== undefined || TEXT_EXTENSIONS.has(extname(file.name)));

	const iconFor = (file: FileEntry) => {
		if (file.type === 'dir') return IconFolder;
		switch (extname(file.name)) {
			case 'jar':
				return IconPackage;
			case 'zip':
			case 'gz':
			case 'tar':
			case 'tgz':
			case 'rar':
			case '7z':
			case 'tar.gz':
				return IconFileZip;
			case 'json':
				return IconBraces;
			case 'yml':
			case 'yaml':
			case 'properties':
			case 'conf':
			case 'cfg':
			case 'ini':
			case 'toml':
			case 'xml':
				return IconFileSettings;
			case 'sh':
			case 'java':
			case 'js':
			case 'ts':
			case 'sql':
				return IconFileCode;
			case 'log':
			case 'txt':
			case 'md':
				return IconFileText;
			case 'png':
			case 'jpg':
			case 'jpeg':
			case 'gif':
			case 'webp':
			case 'ico':
				return IconPhoto;
			default:
				return IconFile;
		}
	};

	const iconColor = (file: FileEntry) => {
		if (file.type === 'dir') return 'text-indigo-400/80';
		const ext = extname(file.name);
		if (ARCHIVE_EXTENSIONS.has(ext)) return 'text-amber-300/80';
		if (['json', 'yml', 'yaml', 'properties', 'conf', 'cfg', 'ini', 'toml', 'xml'].includes(ext))
			return 'text-emerald-300/70';
		if (['sh', 'java', 'js', 'ts', 'sql'].includes(ext)) return 'text-indigo-300/80';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) return 'text-sky-300/70';
		return 'text-white/40';
	};

	const splitName = (name: string) => {
		const index = name.lastIndexOf('.');
		return index > 0 ? { base: name.slice(0, index), ext: name.slice(index) } : { base: name, ext: '' };
	};

	const uniqueName = (list: FileEntry[], name: string) => {
		const { base, ext } = splitName(name);
		let candidate = name;
		let count = 1;
		while (list.some((entry) => entry.name === candidate)) candidate = `${base} (${count++})${ext}`;
		return candidate;
	};

	const openEditor = async (file: FileEntry) => {
		if (!isText(file)) {
			panel.showNotice(`${file.name} cannot be opened in the editor.`);
			return;
		}

		const request = ++editorRequest;
		const directory = path;
		editor = { file, dir: directory };
		draft = '';
		preview = false;
		menu = null;
		editorLoading = true;

		try {
			const content =
				file.content ??
				(await adapter.readFile(server.id, `${directory}/${file.name}`));

			if (request === editorRequest) draft = content;
		} catch (cause) {
			if (request === editorRequest) {
				panel.showNotice(cause instanceof Error ? cause.message : 'Could not open file.');
			}
		} finally {
			if (request === editorRequest) editorLoading = false;
		}
	};

	const open = (file: FileEntry) => {
		if (file.type === 'dir') {
			void navigate(`${path}/${file.name}`);
			return;
		}
		void openEditor(file);
	};

	const openMenu = (event: MouseEvent, file: FileEntry) => {
		event.preventDefault();
		selected = file.name;
		const x = Math.min(event.clientX, window.innerWidth - 224);
		const y = Math.min(event.clientY, window.innerHeight - 248);
		menu = { x: Math.max(8, x), y: Math.max(8, y), file };
	};

	const openMenuAt = (event: MouseEvent, file: FileEntry) => {
		event.stopPropagation();
		selected = file.name;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = Math.min(rect.right - 208, window.innerWidth - 224);
		const y = Math.min(rect.bottom + 4, window.innerHeight - 248);
		menu = { x: Math.max(8, x), y: Math.max(8, y), file };
	};

	let lastTap = { name: '', time: 0 };
	let suppressTapUntil = 0;
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let pressStart = { x: 0, y: 0 };

	const cancelPress = () => {
		if (pressTimer) clearTimeout(pressTimer);
		pressTimer = null;
	};

	const startPress = (event: PointerEvent, file: FileEntry) => {
		if (event.pointerType === 'mouse') return;

		cancelPress();
		pressStart = { x: event.clientX, y: event.clientY };
		pressTimer = setTimeout(() => {
			pressTimer = null;
			suppressTapUntil = Date.now() + 700;
			selected = file.name;

			const x = Math.min(pressStart.x, window.innerWidth - 224);
			const y = Math.min(pressStart.y, window.innerHeight - 248);
			menu = { x: Math.max(8, x), y: Math.max(8, y), file };

			navigator.vibrate?.(10);
		}, 500);
	};

	const movePress = (event: PointerEvent) => {
		if (!pressTimer) return;
		if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) {
			cancelPress();
		}
	};

	const handleRowClick = (file: FileEntry) => {
		if (Date.now() < suppressTapUntil) return;

		selected = file.name;

		const now = Date.now();
		if (lastTap.name === file.name && now - lastTap.time < 320) {
			lastTap = { name: '', time: 0 };
			open(file);
			return;
		}

		lastTap = { name: file.name, time: now };
	};

	const handleWindowClick = () => {
		if (Date.now() < suppressTapUntil) return;
		menu = null;
	};

	const closeEditor = () => {
		editorRequest += 1;
		editorLoading = false;
		editor = null;
	};

	const save = async () => {
		if (!editor) return;

		try {
			await adapter.writeFile(server.id, `${editor.dir}/${editor.file.name}`, draft);
			editor.file.content = draft;
			editor.file.size = new TextEncoder().encode(draft).length;
			editor.file.modified = new Date().toISOString();
			await refresh();
			panel.showNotice(`Saved ${editor.file.name}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not save file.');
		}
	};

	const copyFile = (file: FileEntry) => {
		clipboard = { file: { ...file }, from: path };
		panel.showNotice(`Copied ${file.name}.`);
	};

	const paste = async () => {
		if (!clipboard) return;
		const list = tree[path] ?? [];
		const name = uniqueName(list, clipboard.file.name);

		try {
			await adapter.copyFile(
				server.id,
				`${clipboard.from}/${clipboard.file.name}`,
				`${path}/${name}`
			);
			await refresh();
			panel.showNotice(`Pasted ${name}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not paste file.');
		}
	};

	const compress = async (file: FileEntry) => {
		const list = tree[path] ?? [];
		const target =
			file.type === 'dir'
				? uniqueName(list, `${file.name}.tar.gz`)
				: uniqueName(list, `${splitName(file.name).base}.zip`);

		try {
			await adapter.compressFiles(server.id, [`${path}/${file.name}`], target);
			await refresh();
			menu = null;
			panel.showNotice(`Compressed ${file.name} to ${target}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not compress file.');
		}
	};

	const decompress = async (file: FileEntry) => {
		try {
			await adapter.decompressFile(server.id, `${path}/${file.name}`);
			await refresh();
			menu = null;
			panel.showNotice(`Extracted ${file.name}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not decompress file.');
		}
	};

	const remove = async (file: FileEntry) => {
		try {
			await adapter.deleteFiles(server.id, [`${path}/${file.name}`]);
			await refresh();
			selected = null;
			menu = null;
			panel.showNotice(`Deleted ${file.name}.`);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not delete file.');
		}
	};

	const newFile = async () => {
		const list = tree[path] ?? [];
		const name = uniqueName(list, 'untitled.txt');

		try {
			await adapter.createFile(server.id, path, name);
			await refresh();
			const file = (tree[path] ?? []).find((entry) => entry.name === name);
			if (file) void openEditor(file);
		} catch (cause) {
			panel.showNotice(cause instanceof Error ? cause.message : 'Could not create file.');
		}
	};

	const handleUpload = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;

		if (!input.files?.length) return;

		input.form?.requestSubmit();
	};

	const upload: SubmitFunction = () => {
		uploading = true;

		return async ({ result }) => {
			uploading = false;

			if (uploadInput) uploadInput.value = '';

			if (result.type === 'success') {
				const uploaded = (result.data as { uploaded?: string[] } | null)?.uploaded ?? [];
				await refresh();
				panel.showNotice(
					uploaded.length === 1
						? `Uploaded ${uploaded[0]}.`
						: `Uploaded ${uploaded.length} files.`
				);
				return;
			}

			if (result.type === 'failure') {
				const error = (result.data as { error?: string } | null)?.error;
				panel.showNotice(error ?? 'The files could not be uploaded.');
			}
		};
	};

	const openFolder = () => {
		folderNameInput = '';
		folderError = '';
		folderOpen = true;
	};

	const createFolder: SubmitFunction = () => {
		creatingFolder = true;
		folderError = '';

		return async ({ result }) => {
			creatingFolder = false;

			if (result.type === 'success') {
				const created = (result.data as { created?: string } | null)?.created ?? 'folder';
				folderOpen = false;
				await refresh();
				panel.showNotice(`Created ${created}.`);
				return;
			}

			if (result.type === 'failure') {
				folderError =
					(result.data as { error?: string } | null)?.error ?? 'The folder could not be created.';
			}
		};
	};

	type MenuItem = {
		label: string;
		icon: typeof IconFolder;
		action: () => void;
		danger?: boolean;
	};

	const menuItems = $derived.by((): MenuItem[] => {
		const file = menu?.file;
		if (!file) return [];

		const allowed = (action: FileAction) => !file.actions || file.actions.includes(action);
		const items: MenuItem[] = [];

		if (file.type === 'dir' && allowed('open')) {
			items.push({ label: 'Open', icon: IconFolderOpen, action: () => open(file) });
		} else if (isText(file) && allowed('edit')) {
			items.push({ label: 'Edit', icon: IconPencil, action: () => void openEditor(file) });
		}

		if (file.type === 'file' && allowed('download')) {
			items.push({
				label: 'Download',
				icon: IconDownload,
				action: () => {
					const filePath = encodeURIComponent(`${path}/${file.name}`);
					window.open(`/api/servers/${encodeURIComponent(server.id)}/files/download?path=${filePath}`, '_blank', 'noopener');
				}
			});
		}

		if (allowed('copy')) {
			items.push({ label: 'Copy', icon: IconCopy, action: () => copyFile(file) });
		}

		if (isArchive(file.name) && allowed('decompress')) {
			items.push({ label: 'Decompress', icon: IconArchive, action: () => decompress(file) });
		} else if (allowed('compress')) {
			items.push({ label: 'Compress', icon: IconFileZip, action: () => compress(file) });
		}

		if (allowed('delete')) {
			items.push({ label: 'Delete', icon: IconTrash, action: () => remove(file), danger: true });
		}

		return items;
	});

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		menu = null;
		if (editor) closeEditor();
	};

	const formatSize = (bytes: number | null) => {
		if (bytes === null) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	const formatDate = (value: string) =>
		new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});

	const draftSize = $derived(new TextEncoder().encode(draft).length);
	const draftLines = $derived(draft.split('\n').length);

	const diskUsed = $derived(server.disk.used * 1024 * 1024);
	const diskLimit = $derived(server.disk.limit * 1024 * 1024);
	const diskFree = $derived(Math.max(0, diskLimit - diskUsed));
	const diskPct = $derived(diskLimit ? Math.min(100, (diskUsed / diskLimit) * 100) : 0);
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

{#if editor}
	{@const Icon = iconFor(editor.file)}
	<div>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-3">
				<button
					type="button"
					onclick={closeEditor}
					aria-label="Back to files"
					class="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
				>
					<IconArrowLeft class="h-4 w-4" />
				</button>
				<div class="min-w-0">
					<h2 class="flex items-center gap-2 text-sm font-semibold text-white">
						<Icon class="h-4 w-4 shrink-0 {iconColor(editor.file)}" />
						<span class="truncate">{editor.file.name}</span>
					</h2>
					<p class="truncate font-mono text-[11px] text-white/40">
						{editor.dir}/{editor.file.name}
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => (preview = !preview)}
					class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
				>
					<IconEye class="h-3.5 w-3.5" />
					{preview ? 'Edit' : 'Preview'}
				</button>
				<button
					type="button"
					onclick={save}
					disabled={editorLoading}
					class="flex items-center gap-1.5 border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-40"
				>
					<IconDeviceFloppy class="h-3.5 w-3.5" />
					Save
				</button>
			</div>
		</div>

		<CodeBlock.Root size="sm" class="border-white/10 bg-[#161616]">
			<CodeBlock.Header class="border-b border-white/10 pb-2">
				<CodeBlock.Title class="font-mono text-[11px] text-white/40">
					{preview ? 'Preview' : 'Plain text editor'}
				</CodeBlock.Title>
				<CodeBlock.Actions>
					<CodeBlock.CopyButton value={draft} />
				</CodeBlock.Actions>
			</CodeBlock.Header>

			{#if preview}
				<CodeBlock.Content
					code={draft}
					lineNumbers
					wrap
					class="h-[calc(100svh-19rem)] min-h-[320px] bg-[#0d0d0d] text-xs text-white/70"
				/>
			{:else}
				<textarea
					bind:value={draft}
					spellcheck="false"
					disabled={editorLoading}
					placeholder={editorLoading ? 'Loading file...' : ''}
					class="h-[calc(100svh-19rem)] min-h-[320px] w-full resize-none bg-[#0d0d0d] px-4 py-4 font-mono text-xs leading-relaxed text-white/80 focus:outline-none disabled:opacity-60"
				></textarea>
			{/if}

			<CodeBlock.Footer class="justify-between border-t border-white/10 py-2">
				<span class="font-mono text-[10px] text-white/30">
					{editorLoading ? 'Loading file...' : `${draftLines} lines · ${formatSize(draftSize)}`}
				</span>
				<span class="font-mono text-[10px] text-white/30">
					{preview ? 'Read-only preview' : 'Esc to go back'}
				</span>
			</CodeBlock.Footer>
		</CodeBlock.Root>
	</div>
{:else}
<section class="mb-4 border border-white/10 bg-[#1a1a1a] px-4 py-3">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<div class="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/5">
				<IconServer class="h-4 w-4 text-white/60" />
			</div>
			<div>
				<p class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Disk storage</p>
				<p class="mt-0.5 font-mono text-xs text-white/80">
					{formatSize(diskUsed)} <span class="text-white/30">/ {formatSize(diskLimit)}</span>
				</p>
			</div>
		</div>

		<div class="min-w-56 flex-1">
			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-wider text-white/40 uppercase"
			>
				<span style="color: {usageColor(diskPct)}">{diskPct.toFixed(1)}% used</span>
				<span>{formatSize(diskFree)} remaining</span>
			</div>
			<div class="mt-2 h-1 w-full bg-white/5">
				<div
					class="h-full transition-all duration-500"
					style="width: {diskPct}%; background-color: {usageColor(diskPct)}"
				></div>
			</div>
		</div>
	</div>
</section>

<section class="border border-white/10 bg-[#1a1a1a]">
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each crumbs as crumb, index (crumb.path)}
					<Breadcrumb.Item>
						{#if index === crumbs.length - 1}
							<Breadcrumb.Page class="font-mono text-xs font-normal text-white">
								{crumb.label}
							</Breadcrumb.Page>
						{:else}
							<Breadcrumb.Link
								href={crumb.path}
								onclick={(event) => {
									event.preventDefault();
									void navigate(crumb.path);
								}}
								class="flex items-center gap-1.5 font-mono text-xs text-white/40 hover:text-white"
							>
								{#if index === 0}
									<IconFolderOpen class="h-3.5 w-3.5" />
								{/if}
								{crumb.label}
							</Breadcrumb.Link>
						{/if}
					</Breadcrumb.Item>
					{#if index < crumbs.length - 1}
						<Breadcrumb.Separator class="text-white/20" />
					{/if}
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<div class="flex items-center gap-2">
			{#if clipboard && fileCapabilities.write}
				<button
					type="button"
					onclick={paste}
					class="flex items-center gap-1.5 border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20"
				>
					<IconClipboard class="h-3.5 w-3.5" />
					Paste {clipboard.file.name}
				</button>
			{/if}
			{#if fileCapabilities.write}
				<button
					type="button"
					onclick={newFile}
					class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
				>
					<IconPlus class="h-3.5 w-3.5" />
					New file
				</button>
				<button
					type="button"
					onclick={openFolder}
					class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
				>
					<IconFolderPlus class="h-3.5 w-3.5" />
					New folder
				</button>
			{/if}
			{#if fileCapabilities.upload}
				<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={upload}>
					<input type="hidden" name="directory" value={path} />
					<button
						type="button"
						onclick={() => uploadInput?.click()}
						disabled={uploading}
						class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
					>
						<IconUpload class="h-3.5 w-3.5" />
						{uploading ? 'Uploading...' : 'Upload'}
					</button>
					<input
						bind:this={uploadInput}
						type="file"
						name="files"
						multiple
						class="hidden"
						onchange={handleUpload}
					/>
				</form>
			{/if}
		</div>
	</div>

	<div class="overflow-x-auto">
	<table class="w-full text-left text-sm select-none">
		<thead>
			<tr class="border-b border-white/10 text-[10px] tracking-widest text-white/40 uppercase">
				<th class="px-4 py-2 font-semibold">Name</th>
				<th class="hidden px-4 py-2 font-semibold sm:table-cell">Size</th>
				<th class="hidden px-4 py-2 font-semibold md:table-cell">Modified</th>
				<th class="px-4 py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each files as file (file.name)}
				{@const Icon = iconFor(file)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<tr
					class="touch-manipulation border-b border-white/5 transition last:border-0 hover:bg-white/[0.02]
						{selected === file.name ? 'bg-white/[0.04]' : ''}"
					onclick={() => handleRowClick(file)}
					oncontextmenu={(event) => openMenu(event, file)}
					onpointerdown={(event) => startPress(event, file)}
					onpointermove={movePress}
					onpointerup={cancelPress}
					onpointercancel={cancelPress}
					onpointerleave={cancelPress}
				>
					<td class="px-4 py-2.5">
						<button
							type="button"
							class="flex items-center gap-2 text-left text-sm text-white/80 transition hover:text-white"
						>
							<Icon class="h-4 w-4 shrink-0 {iconColor(file)}" />
							{file.name}
						</button>
					</td>
					<td class="hidden px-4 py-2.5 font-mono text-xs text-white/40 sm:table-cell">
						{formatSize(file.size)}
					</td>
					<td class="hidden px-4 py-2.5 text-xs text-white/40 md:table-cell">
						{formatDate(file.modified)}
					</td>
					<td class="px-4 py-2.5">
						<div class="flex items-center justify-end">
							<button
								type="button"
								onclick={(event) => openMenuAt(event, file)}
								aria-label="File actions"
								class="flex h-7 w-7 items-center justify-center text-white/40 transition hover:bg-white/5 hover:text-white
									{menu?.file.name === file.name ? 'bg-white/5 text-white' : ''}"
							>
								<IconDots class="h-4 w-4" />
							</button>
						</div>
					</td>
				</tr>
			{/each}
			{#if !files.length}
				<tr>
					<td colspan="4" class="px-4 py-10 text-center text-xs text-white/40">
						This folder is empty.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
	</div>
</section>

<Modal
	open={folderOpen}
	title="New folder"
	description={`Create a folder in ${path}.`}
	onclose={() => {
		if (!creatingFolder) folderOpen = false;
	}}
>
	<form id="create-folder" method="POST" action="?/createDirectory" use:enhance={createFolder} class="space-y-3">
		<input type="hidden" name="directory" value={path} />
		<label class="block">
			<span class="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
				Folder name
			</span>
			<input
				bind:value={folderNameInput}
				name="name"
				autocomplete="off"
				placeholder="new-folder"
				class="mt-1 w-full border border-white/10 bg-[#121212] px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none"
			/>
		</label>
		{#if folderError}
			<p class="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
				{folderError}
			</p>
		{/if}
	</form>

	{#snippet footer()}
		<button
			type="button"
			onclick={() => (folderOpen = false)}
			disabled={creatingFolder}
			class="border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
		>
			Cancel
		</button>
		<button
			type="submit"
			form="create-folder"
			disabled={creatingFolder || !folderNameInput.trim()}
			class="border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-40"
		>
			{creatingFolder ? 'Creating...' : 'Create folder'}
		</button>
	{/snippet}
</Modal>

{#if menu}
	<div
		class="fixed z-50 w-52 border border-white/10 bg-[#1a1a1a] py-1 shadow-xl"
		style="left: {menu.x}px; top: {menu.y}px"
	>
		<div class="truncate border-b border-white/5 px-3 py-1.5 font-mono text-[10px] text-white/30">
			{menu.file.name}
		</div>
		{#each menuItems as item (item.label)}
			<button
				type="button"
				onclick={item.action}
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition
					{item.danger
					? 'text-red-300/80 hover:bg-red-500/10 hover:text-red-300'
					: 'text-white/70 hover:bg-white/5 hover:text-white'}"
			>
				<item.icon class="h-3.5 w-3.5" />
				{item.label}
			</button>
		{/each}
	</div>
{/if}

{/if}
