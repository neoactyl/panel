import { COMMANDS as BUNDLED_COMMANDS } from '#lib/minecraft/data.ts';
import type { CommandNode } from '#lib/minecraft/data.ts';

const API_BASE = 'https://xerinv0.github.io/mc-data';
const REDIRECT_DEPTH = 2;

type RawCommandNode = {
	type?: string;
	children?: Record<string, RawCommandNode>;
	redirect?: string | string[];
};

const emptyNode = (): CommandNode => ({ l: {}, a: [] });

const cloneNode = (node: CommandNode, depth: number): CommandNode => {
	const clone = emptyNode();
	clone.a = [...node.a];
	if (depth <= 0) return clone;

	for (const [name, child] of Object.entries(node.l)) {
		clone.l[name] = cloneNode(child, depth - 1);
	}
	return clone;
};

const resolvePath = (root: RawCommandNode, path: string): RawCommandNode | undefined => {
	let node: RawCommandNode | undefined = root;
	for (const segment of path.trim().split(/\s+/)) {
		node = node?.children?.[segment];
		if (!node) return undefined;
	}
	return node;
};

const redirectList = (redirect: RawCommandNode['redirect']): string[] => {
	if (!redirect) return [];
	return Array.isArray(redirect) ? redirect : [redirect];
};

const expandRuns = (node: CommandNode, commands: Record<string, CommandNode>, insideExecute: boolean) => {
	for (const [name, child] of Object.entries(node.l)) {
		if (insideExecute && name === 'run') {
			if (!Object.keys(child.l).length && !child.a.length) {
				const clone = cloneNode({ l: commands, a: [] }, REDIRECT_DEPTH);
				child.l = clone.l;
				child.a = clone.a;
			}
			continue;
		}
		expandRuns(child, commands, insideExecute);
	}
};

export const buildCommandTree = (payload: unknown): Record<string, CommandNode> => {
	const root = ((payload as { root?: RawCommandNode }).root ?? payload) as RawCommandNode;
	const commands: Record<string, CommandNode> = {};
	const converted = new Map<RawCommandNode, CommandNode>();

	const walk = (raw: RawCommandNode, out: CommandNode) => {
		converted.set(raw, out);

		for (const [name, child] of Object.entries(raw.children ?? {})) {
			if (child.type === 'argument') {
				out.a.push(name);
				continue;
			}

			const node = emptyNode();
			out.l[name] = node;
			walk(child, node);
		}
	};

	walk(root, { l: commands, a: [] });

	for (const [raw, node] of converted) {
		if (!raw.redirect || Object.keys(node.l).length || node.a.length) continue;

		for (const path of redirectList(raw.redirect)) {
			const target = resolvePath(root, path);
			const targetNode = target ? converted.get(target) : undefined;
			if (!targetNode) continue;

			const clone = cloneNode(targetNode, REDIRECT_DEPTH);
			node.l = clone.l;
			node.a = clone.a;
			break;
		}
	}

	const execute = commands.execute;
	if (execute) expandRuns(execute, commands, true);

	return commands;
};

const cache = new Map<string, Record<string, CommandNode>>();
const pending = new Map<string, Promise<Record<string, CommandNode>>>();

export const loadCommands = async (version: string): Promise<Record<string, CommandNode>> => {
	if (!version.trim()) return BUNDLED_COMMANDS;

	const cached = cache.get(version);
	if (cached) return cached;

	const existing = pending.get(version);
	if (existing) return existing;

	const request = (async () => {
		try {
			const response = await fetch(
				`${API_BASE}/versions/release/${encodeURIComponent(version)}/reports/commands.json`
			);
			if (!response.ok) throw new Error(`mc-data responded ${response.status}`);

			const tree = buildCommandTree(await response.json());
			if (!Object.keys(tree).length) throw new Error('mc-data returned an empty command tree');

			cache.set(version, tree);
			return tree;
		} catch {
			return BUNDLED_COMMANDS;
		} finally {
			pending.delete(version);
		}
	})();

	pending.set(version, request);
	return request;
};
