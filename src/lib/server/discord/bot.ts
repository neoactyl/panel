import type { Client, Guild, GuildMember, Invite } from "discord.js";
import type { DiscordInviteEvent } from "#lib/server/rewards/invites.ts";
import { handleInteraction, registerCommands } from "./commands.ts";

type CachedInvite = {
  uses: number;
  maxUses: number;
  inviterId: string | null;
  deletedAt: number | null;
};

type InviteMap = Map<string, CachedInvite>;

type BotState = {
  client: Client | null;
  ready: boolean;
  starting: Promise<Client | null> | null;
  generation: number;
  warnedReason: string | null;
  inviteCache: Map<string, InviteMap>;
  queue: DiscordInviteEvent[];
  draining: boolean;
  joinChain: Promise<void>;
  /** Gateway shards this process is responsible for. */
  shardIds: number[];
  /** Total number of shards across every bot process. */
  shardCount: number;
  /** Guilds configured for invite tracking; empty means every guild on our shards. */
  trackedGuildIds: Set<string>;
  /** Subset of trackedGuildIds that this process actually owns. */
  activeGuildIds: Set<string>;
};

const botGlobals = globalThis as typeof globalThis & {
  __neoactylDiscordBotV2?: BotState;
};

const state: BotState = (botGlobals.__neoactylDiscordBotV2 ??= {
  client: null,
  ready: false,
  starting: null,
  generation: 0,
  warnedReason: null,
  inviteCache: new Map(),
  queue: [],
  draining: false,
  joinChain: Promise.resolve(),
  shardIds: [0],
  shardCount: 1,
  trackedGuildIds: new Set(),
  activeGuildIds: new Set(),
});

const LOGIN_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 30_000;
const MAX_CONNECT_ATTEMPTS = 5;
const DELETED_INVITE_WINDOW_MS = 15_000;
const MAX_QUEUE_SIZE = 1000;
const DEBUG =
  process.env.DISCORD_DEBUG === "1" || process.env.DISCORD_DEBUG === "true";

const FATAL_ERROR_CODES = new Set([
  "TokenInvalid",
  "DisallowedIntents",
  "TokenMissing",
]);

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms.`)),
      ms,
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });

const errorCode = (cause: unknown) =>
  typeof cause === "object" && cause !== null && "code" in cause
    ? String(cause.code)
    : "";

const warnOnce = (reason: string, message: string) => {
  if (state.warnedReason === reason) return;

  state.warnedReason = reason;
  console.info(message);
};

const parseShardIds = (raw: string): number[] => {
  const ids = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const id = Number(value);

      if (!Number.isInteger(id) || id < 0) {
        throw new Error(
          `DISCORD_SHARD_IDS contains an invalid shard id: "${value}".`,
        );
      }

      return id;
    });

  return [...new Set(ids)].sort((a, b) => a - b);
};

/**
 * Resolve the shard layout for this process.
 *
 * `DISCORD_SHARD_COUNT` must be identical in every process. A process that only
 * hosts a subset sets `DISCORD_SHARD_IDS` to its ids (for example `1` or
 * `1,2`). The default is the historical single, unsharded client (shard 0/1).
 */
const readShardConfig = (
  rawIdsValue: string | undefined,
  rawCountValue: string | undefined,
) => {
  const rawIds = (rawIdsValue ?? "").trim();
  const parsedIds = rawIds ? parseShardIds(rawIds) : [0];
  const ids = parsedIds.length > 0 ? parsedIds : [0];
  const rawCount = (rawCountValue ?? "").trim();
  const count = rawCount ? Number(rawCount) : Math.max(...ids) + 1;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `DISCORD_SHARD_COUNT must be a positive integer (received "${rawCount}").`,
    );
  }

  const invalid = ids.find((id) => id >= count);

  if (invalid !== undefined) {
    throw new Error(
      `DISCORD_SHARD_IDS contains ${invalid}, but DISCORD_SHARD_COUNT is ${count}.`,
    );
  }

  return { ids, count };
};

const readTrackedGuildIds = (
  serverGuildId: string,
  settingGuildId: string,
  j4rGuildIds: string,
): string[] => {
  const values = [
    serverGuildId,
    settingGuildId,
    ...j4rGuildIds.split(/[\s,]+/),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
};

const isTrackedGuild = (guildId: string) =>
  state.trackedGuildIds.size === 0 || state.trackedGuildIds.has(guildId);

const isActiveGuild = (guildId: string) => state.activeGuildIds.has(guildId);

/** Discord assigns each guild to a shard by taking the high bits of its id. */
const guildShard = (guildId: string, shardCount: number): number | null => {
  if (shardCount <= 1) return 0;
  if (!/^\d{15,20}$/.test(guildId)) return null;

  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
};

const toCache = (invites: Iterable<[string, Invite]>): InviteMap => {
  const next: InviteMap = new Map();

  for (const [code, invite] of invites) {
    next.set(code, {
      uses: invite.uses ?? 0,
      maxUses: invite.maxUses ?? 0,
      inviterId: invite.inviter?.id ?? null,
      deletedAt: null,
    });
  }

  return next;
};

const canManageGuild = async (guild: Guild, manageGuild: bigint) => {
  const me =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  return Boolean(me?.permissions.has(manageGuild));
};

const refreshInvites = async (
  guild: Guild,
  manageGuild: bigint,
): Promise<InviteMap> => {
  if (!(await canManageGuild(guild, manageGuild))) {
    console.warn(
      `[discord] Missing Manage Server permission in ${guild.id}; cannot track invites.`,
    );
    return new Map();
  }

  const invites = await guild.invites.fetch();
  const next = toCache(invites.entries());

  state.inviteCache.set(guild.id, next);
  return next;
};

/**
 * Work out which invite was used by diffing the cached counts with a fresh fetch.
 * Returns null when there is no candidate or the result is ambiguous.
 */
const findInviter = (
  previous: InviteMap,
  current: Map<string, Invite>,
): string | null => {
  const candidates: { code: string; inviterId: string }[] = [];
  const now = Date.now();

  // Invites whose use count went up (or that are new and already used).
  for (const [code, invite] of current) {
    const before = previous.get(code)?.uses ?? 0;
    const uses = invite.uses ?? 0;

    if (uses > before && invite.inviter) {
      candidates.push({ code, inviterId: invite.inviter.id });
    }
  }

  // Invites that vanished: a max-use invite is deleted by Discord when its last use is consumed.
  for (const [code, cached] of previous) {
    if (current.has(code)) continue;
    if (!cached.inviterId || cached.maxUses <= 0) continue;
    if (!cached.deletedAt || now - cached.deletedAt > DELETED_INVITE_WINDOW_MS)
      continue;
    if (cached.uses + 1 < cached.maxUses) continue;

    candidates.push({ code, inviterId: cached.inviterId });
  }

  if (candidates.length === 1) return candidates[0]?.inviterId ?? null;

  if (candidates.length > 1) {
    console.warn(
      `[discord] Ambiguous invite attribution (${candidates.map((c) => c.code).join(", ")}); skipping.`,
    );
  }

  return null;
};

/* -------------------------------------------------------------------------- */
/* Event delivery                                                             */
/* -------------------------------------------------------------------------- */

const deliverEvent = async (event: DiscordInviteEvent) => {
  const { recordInviteJoin, recordInviteLeave } =
    await import("#lib/server/rewards/invites.ts");
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (event.type === "member_join") {
        const result = await recordInviteJoin(event);

        if (!result.recorded) {
          console.info(
            `[discord] Invite not recorded (${result.reason}) for ${event.memberId}.`,
          );
        }
      } else {
        await recordInviteLeave(event);
      }

      return;
    } catch (cause) {
      lastError = cause;

      if (attempt < 3) await sleep(attempt * 1000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Discord event delivery failed.");
};

const drainQueue = async () => {
  if (state.draining) return;

  state.draining = true;

  try {
    while (state.queue.length > 0) {
      const event = state.queue.shift();

      if (!event) continue;

      try {
        await deliverEvent(event);
      } catch (cause) {
        console.error(
          "[discord] Unable to record an invite event after retries.",
          cause,
        );
      }
    }
  } finally {
    state.draining = false;
  }
};

const enqueue = (event: DiscordInviteEvent) => {
  if (state.queue.length >= MAX_QUEUE_SIZE) {
    console.error("[discord] Event queue is full; dropping the oldest event.");
    state.queue.shift();
  }

  state.queue.push(event);
  void drainQueue();
};

const processMemberAdd = async (member: GuildMember) => {
  const guild = member.guild;
  const previous =
    state.inviteCache.get(guild.id) ?? new Map<string, CachedInvite>();

  let current: Map<string, Invite>;

  try {
    current = new Map((await guild.invites.fetch()).entries());
  } catch (cause) {
    console.error(
      "[discord] Unable to fetch invites after a member joined.",
      cause,
    );
    return;
  }

  let inviterId = findInviter(previous, current);

  if (!inviterId) {
    // Discord can lag slightly in updating invite counters.
    await sleep(1000);

    try {
      current = new Map((await guild.invites.fetch()).entries());
      inviterId = findInviter(previous, current);
    } catch (cause) {
      console.error("[discord] Unable to retry invite lookup.", cause);
    }
  }

  // Always rebuild the cache from the freshest data we have.
  state.inviteCache.set(guild.id, toCache(current.entries()));

  if (!inviterId) {
    console.warn(
      `[discord] Could not attribute an inviter for member ${member.id}.`,
    );
    return;
  }

  if (inviterId === member.id) return;

  enqueue({
    type: "member_join",
    guildId: guild.id,
    memberId: member.id,
    inviterId,
    memberIsBot: false,
    joinedAt: (member.joinedAt ?? new Date()).toISOString(),
  });
};

const handleMemberAdd = (member: GuildMember) => {
  if (member.user.bot) return;

  // Serialize joins so two members joining together don't corrupt each other's diff.
  state.joinChain = state.joinChain
    .then(() => processMemberAdd(member))
    .catch((cause) => {
      console.error("[discord] Unexpected member join handler failure.", cause);
    });
};

const destroyClient = async (client: Client | null) => {
  if (!client) return;

  try {
    client.removeAllListeners();
    client.on("error", () => {});
    await client.destroy();
  } catch {
    // Ignore cleanup failures.
  }
};

const buildClient = async () => {
  const {
    ActivityType,
    Client,
    Events,
    GatewayIntentBits,
    PermissionFlagsBits,
  } = await import("discord.js");
  const manageGuild = PermissionFlagsBits.ManageGuild;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildInvites,
    ],
    // Discord requires every process to agree on the total shard count. A
    // process can own a subset of the ids (for example the web app owns [0]
    // while separate workers own [1], [2] and [3]).
    shardCount: state.shardCount,
    shards: state.shardIds,
    presence: {
      status: "online",
      activities: [{ name: "invites", type: ActivityType.Watching }],
    },
  });

  client.on(Events.Error, (cause) =>
    console.error("[discord] Client error.", cause),
  );
  client.on(Events.Warn, (message) =>
    console.warn("[discord] Warning:", message),
  );
  client.on(Events.ShardError, (cause, id) =>
    console.error(`[discord] Shard ${id} error.`, cause),
  );
  client.on(Events.ShardDisconnect, (event, id) =>
    console.warn(`[discord] Shard ${id} disconnected (code ${event.code}).`),
  );
  client.on(Events.ShardReconnecting, (id) =>
    console.info(`[discord] Shard ${id} reconnecting.`),
  );
  client.on(Events.ShardResume, (id) =>
    console.info(`[discord] Shard ${id} resumed.`),
  );
  client.on(Events.Invalidated, () =>
    console.error("[discord] Session invalidated."),
  );
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.guildId || !isActiveGuild(interaction.guildId)) return;

    void handleInteraction(interaction).catch((cause) => {
      console.error("[discord] Interaction handler failed.", cause);
    });
  });
  if (DEBUG) {
    client.on(Events.Debug, (message) =>
      console.debug("[discord:debug]", message),
    );
  }

  client.on(Events.GuildMemberAdd, (member) => {
    if (!isActiveGuild(member.guild.id)) return;
    handleMemberAdd(member);
  });

  client.on(Events.GuildMemberRemove, (member) => {
    if (member.user.bot || !isActiveGuild(member.guild.id)) return;

    enqueue({
      type: "member_leave",
      guildId: member.guild.id,
      memberId: member.id,
    });
  });

  client.on(Events.InviteCreate, (invite) => {
    const guildId = invite.guild?.id;

    if (!guildId || !isActiveGuild(guildId)) return;

    const cache =
      state.inviteCache.get(guildId) ?? new Map<string, CachedInvite>();

    cache.set(invite.code, {
      uses: invite.uses ?? 0,
      maxUses: invite.maxUses ?? 0,
      inviterId: invite.inviter?.id ?? null,
      deletedAt: null,
    });
    state.inviteCache.set(guildId, cache);
  });

  client.on(Events.InviteDelete, (invite) => {
    const guildId = invite.guild?.id;

    if (!guildId || !isActiveGuild(guildId)) return;

    const entry = state.inviteCache.get(guildId)?.get(invite.code);

    if (entry) entry.deletedAt = Date.now();
  });

  client.on(Events.GuildCreate, (guild) => {
    if (!isTrackedGuild(guild.id)) return;

    state.activeGuildIds.add(guild.id);

    void (async () => {
      try {
        await refreshInvites(guild, manageGuild);
      } catch (cause) {
        console.error(
          "[discord] Unable to refresh invites after joining the guild.",
          cause,
        );
      }

      // During the initial login `connect` registers every active guild once
      // the ready payload has been processed, so only newly joined guilds need
      // commands here.
      if (state.ready) {
        await registerCommands(guild).catch((cause) => {
          console.error(
            `[discord] Unable to register commands in ${guild.id}.`,
            cause,
          );
        });
      }
    })();
  });

  client.on(Events.GuildDelete, (guild) => {
    state.activeGuildIds.delete(guild.id);
    state.inviteCache.delete(guild.id);
  });

  return { client, manageGuild, Events };
};

const connect = async (token: string): Promise<Client | null> => {
  const generation = state.generation;
  const shardLabel = `${state.shardIds.join(", ")}/${state.shardCount}`;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    if (generation !== state.generation) return null;

    const { client, manageGuild, Events } = await buildClient();

    const ready = new Promise<void>((resolve) => {
      client.once(Events.ClientReady, () => resolve());
    });

    try {
      console.info(
        `[discord] Logging in shard(s) ${shardLabel} (attempt ${attempt}/${MAX_CONNECT_ATTEMPTS}).`,
      );

      await withTimeout(client.login(token), LOGIN_TIMEOUT_MS, "Discord login");
      await withTimeout(ready, READY_TIMEOUT_MS, "Discord gateway ready");
    } catch (cause) {
      console.error(`[discord] Connection attempt ${attempt} failed.`, cause);
      await destroyClient(client);

      if (FATAL_ERROR_CODES.has(errorCode(cause))) {
        console.error(
          "[discord] Fatal error: check the bot token and that all intents (especially Server Members) are enabled in the Developer Portal.",
        );
        return null;
      }

      if (attempt < MAX_CONNECT_ATTEMPTS) await sleep(attempt * 5000);
      continue;
    }

    if (generation !== state.generation) {
      await destroyClient(client);
      return null;
    }

    state.client = client;
    state.ready = true;
    state.activeGuildIds.clear();

    try {
      // Discord only sends guilds that belong to this process's shards, so the
      // cache is the authoritative list of what this process can serve.
      const targets = [...client.guilds.cache.keys()].filter((id) =>
        isTrackedGuild(id),
      );

      for (const id of targets) state.activeGuildIds.add(id);

      if (state.trackedGuildIds.size > 0) {
        const skipped = [...state.trackedGuildIds].filter(
          (id) => !state.activeGuildIds.has(id),
        );

        if (skipped.length > 0) {
          console.info(
            `[discord] Shard(s) ${shardLabel} do not serve ${skipped.join(", ")}; leaving those to their own shard.`,
          );
        }
      }

      if (targets.length === 0) {
        console.info(
          `[discord] Shard(s) ${shardLabel} have no assigned guilds to track.`,
        );
      }

      for (const id of targets) {
        const guild =
          client.guilds.cache.get(id) ?? (await client.guilds.fetch(id));

        await refreshInvites(guild, manageGuild);
        await registerCommands(guild);
        console.info(
          `[discord] Tracking invites for ${guild.name} (${guild.id}) on shard(s) ${shardLabel}.`,
        );
      }
    } catch (cause) {
      console.error(
        "[discord] The bot is online but one or more guilds could not be prepared. Is it invited to those servers and does it have Manage Server?",
        cause,
      );
    }

    console.info(
      `[discord] Online as ${client.user?.tag ?? "unknown"} on shard(s) ${shardLabel}.`,
    );

    return client;
  }

  console.error("[discord] Giving up after repeated connection failures.");
  return null;
};

const start = async (): Promise<Client | null> => {
  const { getBool, getSetting, loadSettings } =
    await import("#lib/server/config/settings.ts");
  const { serverEnv } = await import("#lib/server/config/env.ts");

  const { ids, count } = readShardConfig(
    serverEnv.DISCORD_SHARD_IDS,
    serverEnv.DISCORD_SHARD_COUNT,
  );

  state.shardIds = ids;
  state.shardCount = count;

  await loadSettings();

  if (!getBool("discord.inviteTrackingEnabled")) {
    warnOnce(
      "disabled",
      "[discord] Invite tracking is disabled; embedded bot not started.",
    );
    return null;
  }

  const token =
    (serverEnv.DISCORD_BOT_TOKEN ?? "").trim() ||
    getSetting("discord.botToken").trim();
  const trackedGuildIds = readTrackedGuildIds(
    (serverEnv.DISCORD_GUILD_ID ?? "").trim(),
    getSetting("discord.guildId"),
    getSetting("discord.j4rGuildIds"),
  );

  if (!token) {
    warnOnce(
      "unconfigured",
      "[discord] Invite bot not started: no bot token is configured.",
    );
    return null;
  }

  state.warnedReason = null;
  state.trackedGuildIds = new Set(trackedGuildIds);

  await (await import("#lib/server/db/bootstrap.ts")).ensureOperationalSchema();

  console.info(
    `[discord] Starting shard(s) ${ids.join(", ")} of ${count}; tracking ${
      trackedGuildIds.length > 0
        ? `${trackedGuildIds.length} configured guild(s)`
        : "every guild on these shards"
    }.`,
  );

  for (const guildId of trackedGuildIds) {
    const shard = guildShard(guildId, count);

    if (shard !== null) {
      console.info(
        `[discord] Guild ${guildId} is assigned to shard ${shard}/${count}.`,
      );
    }
  }

  return connect(token);
};

export const startDiscordBot = async (): Promise<Client | null> => {
  if (state.ready && state.client) return state.client;
  if (state.starting) return state.starting;

  const promise = start()
    .catch((cause) => {
      console.error(
        "[discord] Unable to start the embedded invite bot.",
        cause,
      );
      return null;
    })
    .finally(() => {
      if (state.starting === promise) state.starting = null;
    });

  state.starting = promise;
  return promise;
};

export const stopDiscordBot = async () => {
  state.generation += 1;
  state.starting = null;

  const client = state.client;

  state.client = null;
  state.ready = false;
  state.inviteCache.clear();
  state.activeGuildIds.clear();
  state.trackedGuildIds.clear();

  await destroyClient(client);
};

export const restartDiscordBot = async () => {
  await stopDiscordBot();
  state.warnedReason = null;
  return startDiscordBot();
};
