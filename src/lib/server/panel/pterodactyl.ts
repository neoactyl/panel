import { FetchTimeoutError, fetchWithTimeout } from "#lib/http.ts";
import {
  Adapter,
  AdapterError,
  DEFAULT_SERVER_LIMITS,
  FILES_ROOT,
  type AdapterCapabilities,
  type Activity,
  type Allocation,
  type Backup,
  type ConsoleLine,
  type CreateBackup,
  type CreateDatabase,
  type CreateSchedule,
  type CreateServer,
  type CreateSubuser,
  type Database,
  type FileEntry,
  type FileSystem,
  type Node,
  type PanelActionRequest,
  type PanelActionResult,
  type PanelErrorCode,
  type PanelPrompt,
  type PanelScope,
  type PermissionGroup,
  type ResourceUsage,
  type Schedule,
  type ScheduleAction,
  type Server,
  type Software,
  type SoftwareGroup,
  type SoftwareVariable,
  type Startup,
  type Subuser,
  type UpdateNode,
  type UpdateSchedule,
  type UpdateServer,
  type UpdateStartup,
  type UpdateSubuser,
  type UploadFile,
  type User,
  type WebsocketCredentials,
} from "#lib/adapter/sdk.ts";

type PteroResource<T> = {
  object?: string;
  attributes: T;
};

type PteroList<T> = {
  object?: string;
  data?: Array<PteroResource<T>>;
  meta?: {
    pagination?: {
      total?: number;
      count?: number;
      current_page?: number;
      total_pages?: number;
      per_page?: number;
    };
  };
};

type PteroUser = {
  id: number;
  uuid: string;
  username: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  root_admin?: boolean;
};

type PteroLimits = {
  memory: number;
  swap?: number;
  disk: number;
  io?: number;
  cpu: number;
  threads?: number | null;
};

type PteroFeatureLimits = {
  databases?: number;
  allocations?: number;
  backups?: number;
};

type PteroAllocation = {
  id: number;
  ip: string;
  ip_alias?: string | null;
  port: number;
  notes?: string | null;
  assigned?: boolean;
  is_default?: boolean;
};

type PteroAppServer = {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  description?: string | null;
  status?: string | null;
  suspended?: boolean;
  user?: number;
  node?: number;
  allocation?: number;
  limits: PteroLimits;
  feature_limits?: PteroFeatureLimits;
  container?: {
    startup_command?: string;
    image?: string;
    environment?: Record<string, string>;
  };
  relationships?: {
    user?: PteroResource<PteroUser>;
    node?: PteroResource<{ id: number; name: string }>;
    allocations?: PteroList<PteroAllocation>;
    variables?: PteroList<PteroEggVariable>;
  };
};

type PteroClientServer = {
  identifier: string;
  uuid: string;
  internal_id: number;
  name: string;
  description?: string | null;
  status?: string | null;
  is_suspended?: boolean;
  node?: string;
  limits: PteroLimits;
  feature_limits?: PteroFeatureLimits;
  relationships?: {
    allocations?: PteroList<PteroAllocation>;
  };
};

type PteroResources = {
  current_state?: string;
  is_suspended?: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    uptime: number;
  };
};

type PteroFile = {
  name: string;
  size: number;
  is_file: boolean;
  is_symlink?: boolean;
  modified_at: string;
};

type PteroBackup = {
  uuid: string;
  name: string;
  bytes: number;
  created_at?: string | null;
  completed_at?: string | null;
  is_successful?: boolean;
};

type PteroDatabase = {
  id: number;
  name: string;
  username: string;
  host?: { address?: string; port?: number };
  connections_from?: string;
  max_connections?: number;
};

type PteroTask = {
  action: string;
  payload?: string;
  time_offset?: number;
  sequence_id?: number;
  continue_on_failure?: boolean;
};

type PteroSchedule = {
  id: number;
  name: string;
  cron: {
    minute: string;
    hour: string;
    day_of_month: string;
    month: string;
    day_of_week: string;
  };
  is_active: boolean;
  is_processing?: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  relationships?: { tasks?: PteroList<PteroTask> };
};

type PteroStartupVariable = {
  env_variable: string;
  name?: string | null;
  description?: string | null;
  default_value?: string | null;
  server_value?: string | null;
  is_editable?: boolean | null;
};

type PteroStartup = {
  startup_command?: string;
  docker_images?: Record<string, string>;
  relationships?: { variables?: PteroList<PteroStartupVariable> };
};

type PteroSubuser = {
  uuid: string;
  username: string;
  email: string;
  created_at?: string | null;
  permissions?: string[];
};

type PteroActivity = {
  id: string;
  event: string;
  description?: string | null;
  ip_address?: string | null;
  timestamp?: string | null;
  relationships?: {
    actor?: PteroResource<{ username?: string; email?: string }>;
  };
};

type PteroEgg = {
  id: number;
  uuid: string;
  name: string;
  description?: string | null;
  docker_images?: Record<string, string>;
  startup?: string | null;
  relationships?: { variables?: PteroList<PteroEggVariable> };
};

type PteroEggVariable = {
  env_variable: string;
  name?: string | null;
  description?: string | null;
  default_value?: string | null;
  user_editable?: boolean | null;
};

type PteroNest = {
  id: number;
  uuid: string;
  name: string;
  description?: string | null;
};

type PteroNode = {
  id: number;
  uuid: string;
  name: string;
  maintenance_mode?: boolean;
  memory: number;
  disk: number;
  memory_overallocate?: number;
  disk_overallocate?: number;
};

const MEGABYTE = 1024 * 1024;

const STATUS_MAP: Record<string, Server["state"]> = {
  offline: "offline",
  starting: "starting",
  stopping: "stopping",
  running: "running",
  installing: "installing",
  install_failed: "unknown",
  restoring_backup: "installing",
  suspended: "suspended",
};

const POWER_ACTIONS = new Set(["start", "stop", "restart", "kill"]);

const isClientServer = (
  server: PteroAppServer | PteroClientServer,
): server is PteroClientServer => "is_suspended" in server;

function errorForStatus(status: number): PanelErrorCode {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

const encode = (value: string) => encodeURIComponent(value);

const parentOf = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
};

const basenameOf = (path: string): string =>
  path.replace(/\/+$/, "").split("/").pop() ?? path;

export class Pterodactyl extends Adapter {
  private static readonly PER_PAGE = 100;
  private static readonly METADATA_TTL = 60_000;

  readonly capabilities: AdapterCapabilities;

  #clientToken: string;
  #cache = new Map<string, { expires: number; promise: Promise<unknown> }>();
  #servers = new Map<string, { appId: string; identifier: string }>();

  constructor(url: string, token: string, clientToken = "") {
    super(url, token);

    this.#clientToken = clientToken.trim();

    const client = Boolean(this.#clientToken);

    this.capabilities = {
      servers: {
        list: true,
        create: true,
        update: true,
        delete: true,
        suspend: true,
        power: client,
      },
      console: { commands: client, history: false, websocket: client },
      files: { read: client, write: client, upload: client, manage: false },
      allocations: client,
      backups: client,
      databases: client,
      schedules: client,
      startup: client,
      subusers: client,
      activities: client,
      resources: client,
      accounts: { link: false, create: false, delete: false },
      nodes: { list: true, update: true },
    };
  }

  async #cached<T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const hit = this.#cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise as Promise<T>;

    const promise = load();
    this.#cache.set(key, { expires: Date.now() + ttl, promise });

    try {
      return await promise;
    } catch (cause) {
      if (this.#cache.get(key)?.promise === promise) this.#cache.delete(key);
      throw cause;
    }
  }

  async #send(
    base: "application" | "client",
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = base === "client" ? this.#clientToken : this.token;

    if (!token) {
      throw new AdapterError(
        "A Pterodactyl client API token is required for this operation.",
        "UNAUTHORIZED",
        401,
      );
    }

    const endpoint = new URL(path, this.url);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);

    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, { ...init, headers });
    } catch (cause) {
      if (cause instanceof FetchTimeoutError) {
        throw new AdapterError(cause.message, "NETWORK");
      }

      throw new AdapterError("The panel could not be reached.", "NETWORK");
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        errors?: Array<{ detail?: string; code?: string }>;
      } | null;

      throw new AdapterError(
        body?.errors?.[0]?.detail ??
          `Pterodactyl request failed with status ${response.status}`,
        errorForStatus(response.status),
        response.status,
      );
    }

    return response;
  }

  async #json<T>(
    base: "application" | "client",
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.#send(base, path, init);

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AdapterError(
        "Malformed JSON response from the panel.",
        "UNKNOWN",
        response.status,
      );
    }
  }

  #resource<T>(
    base: "application" | "client",
    path: string,
    init?: RequestInit,
  ): Promise<PteroResource<T>> {
    return this.#json<PteroResource<T>>(base, path, init);
  }

  async #list<T>(
    base: "application" | "client",
    path: string,
    query: Record<string, string> = {},
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    for (;;) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(Pterodactyl.PER_PAGE),
        ...query,
      });

      const response = await this.#json<PteroList<T>>(
        base,
        `${path}?${params.toString()}`,
      );

      const data = response.data ?? [];
      items.push(...data.map((item) => item.attributes));

      const pagination = response.meta?.pagination;
      if (data.length === 0) break;
      if (!pagination?.total_pages || page >= pagination.total_pages) break;

      page += 1;
    }

    return items;
  }

  #jsonInit(method: string, body?: unknown): RequestInit {
    return {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    };
  }

  #remember(raw: PteroAppServer) {
    const entry = { appId: String(raw.id), identifier: raw.identifier };

    for (const key of [String(raw.id), raw.uuid, raw.identifier]) {
      if (key) this.#servers.set(key, entry);
    }
  }

  async #appServer(id: string): Promise<PteroAppServer> {
    const response = await this.#resource<PteroAppServer>(
      "application",
      `/api/application/servers/${encode(id)}?include=user,node,allocations`,
    );

    this.#remember(response.attributes);
    return response.attributes;
  }

  async #resolveServer(
    id: string,
  ): Promise<{ appId: string; identifier: string }> {
    const cached = this.#servers.get(id);
    if (cached) return cached;

    if (/^\d+$/.test(id)) {
      const server = await this.#appServer(id);
      return { appId: String(server.id), identifier: server.identifier };
    }

    const servers = await this.#list<PteroAppServer>(
      "application",
      "/api/application/servers",
    );

    for (const server of servers) this.#remember(server);

    const match = this.#servers.get(id);
    if (match) return match;

    throw new AdapterError("Server not found", "NOT_FOUND", 404);
  }

  #panelPath(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    if (normalized === FILES_ROOT) return "/";
    if (normalized.startsWith(`${FILES_ROOT}/`)) {
      return normalized.slice(FILES_ROOT.length);
    }
    return normalized;
  }

  #toServer(
    raw: PteroAppServer | PteroClientServer,
    usage?: ResourceUsage | null,
  ): Server {
    const suspended = isClientServer(raw)
      ? raw.is_suspended
      : raw.suspended;
    const status = raw.status ? STATUS_MAP[raw.status] : undefined;
    const state: Server["state"] =
      suspended || raw.status === "suspended"
        ? "suspended"
        : (usage?.state ?? status ?? "offline");

    const actions: Server["actions"] =
      state === "running"
        ? ["restart", "stop", "kill"]
        : state === "offline"
          ? ["start"]
          : state === "suspended"
            ? []
            : ["stop", "kill"];

    const allocations = raw.relationships?.allocations?.data?.map(
      (entry) => entry.attributes,
    );
    const primary =
      allocations?.find((entry) => entry.id === ("allocation" in raw ? raw.allocation : undefined)) ??
      allocations?.find((entry) => entry.is_default);

    const nodeName = isClientServer(raw)
      ? typeof raw.node === "string"
        ? raw.node
        : ""
      : (raw.relationships?.node?.attributes?.name ?? "");

    const owner = isClientServer(raw)
      ? undefined
      : raw.relationships?.user?.attributes;

    return {
      id: String(isClientServer(raw) ? raw.internal_id : raw.id),
      identifier: raw.identifier,
      name: raw.name,
      description: raw.description ?? "",
      node: nodeName,
      image: ("container" in raw ? raw.container?.image : undefined) ?? "",
      version: "",
      state,
      cpu: { used: usage?.cpu ?? 0, limit: raw.limits.cpu },
      memory: { used: usage?.ram ?? 0, limit: raw.limits.memory },
      disk: { used: usage?.disk ?? 0, limit: raw.limits.disk },
      databaseLimit: raw.feature_limits?.databases,
      allocationLimit: raw.feature_limits?.allocations,
      actions,
      ownerId: owner?.uuid,
    };
  }

  async #resourcesForIdentifier(
    identifier: string,
  ): Promise<ResourceUsage | null> {
    if (!this.#clientToken) return null;

    const response = await this.#resource<PteroResources>(
      "client",
      `/api/client/servers/${encode(identifier)}/resources`,
    );

    const resources = response.attributes.resources;
    const state = response.attributes.current_state ?? "unknown";

    return {
      ram: Math.round(resources.memory_bytes / MEGABYTE),
      disk: Math.round(resources.disk_bytes / MEGABYTE),
      cpu: Math.round(resources.cpu_absolute),
      uptime: resources.uptime,
      state: STATUS_MAP[state] ?? "unknown",
    };
  }

  async #mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        for (;;) {
          const index = next++;
          if (index >= items.length) return;
          const item = items[index];
          if (item === undefined) return;
          results[index] = await fn(item);
        }
      },
    );

    await Promise.all(workers);
    return results;
  }

  async connect(): Promise<boolean> {
    try {
      await this.#json(
        "application",
        "/api/application/nodes?page=1&per_page=1",
      );
      return true;
    } catch {
      return false;
    }
  }

  override async getCurrentUser(): Promise<User> {
    return this.#cached("current-user", Pterodactyl.METADATA_TTL, async () => {
      const users = await this.#list<PteroUser>(
        "application",
        "/api/application/users",
      );
      const chosen = users.find((user) => user.root_admin) ?? users[0];

      if (!chosen) {
        throw new AdapterError(
          "No Pterodactyl user is available to own servers.",
          "NOT_FOUND",
        );
      }

      return {
        id: chosen.uuid,
        username: chosen.username,
        email: chosen.email,
        isAdmin: Boolean(chosen.root_admin),
      };
    });
  }

  async getServers(ownerId?: string): Promise<Server[]> {
    const listed = await this.#list<PteroAppServer>(
      "application",
      "/api/application/servers",
      { include: "user,node,allocations" },
    );

    const raw = ownerId
      ? listed.filter((server) => {
          const owner = server.relationships?.user?.attributes;
          return (
            owner?.uuid === ownerId ||
            (owner?.id !== undefined && String(owner.id) === ownerId) ||
            String(server.user) === ownerId
          );
        })
      : listed;

    for (const server of raw) this.#remember(server);

    if (!this.#clientToken) {
      return raw.map((server) => this.#toServer(server));
    }

    const clientServers = await this.#list<PteroClientServer>(
      "client",
      "/api/client/servers",
    ).catch(() => [] as PteroClientServer[]);

    const accessible = new Map(
      clientServers.map((server) => [server.identifier, server]),
    );

    const usages = await this.#mapLimit(raw, 6, async (server) => {
      if (!accessible.has(server.identifier)) return null;
      return this.#resourcesForIdentifier(server.identifier).catch(() => null);
    });

    return raw.map((server, index) =>
      this.#toServer(server, usages[index] ?? null),
    );
  }

  async getServer(id: string): Promise<Server> {
    const raw = await this.#appServer((await this.#resolveServer(id)).appId);

    const usage = await this.#resourcesForIdentifier(raw.identifier).catch(
      () => null,
    );

    return this.#toServer(raw, usage);
  }

  override async getServerOwner(id: string): Promise<string | null> {
    return this.#cached(`owner:${id}`, 15_000, async () => {
      const raw = await this.#appServer((await this.#resolveServer(id)).appId);
      return raw.relationships?.user?.attributes?.uuid ?? null;
    });
  }

  async #nodes(): Promise<PteroNode[]> {
    return this.#cached("nodes", Pterodactyl.METADATA_TTL, () =>
      this.#list<PteroNode>("application", "/api/application/nodes"),
    );
  }

  async #nodeAllocations(nodeId: string): Promise<PteroAllocation[]> {
    return this.#list<PteroAllocation>(
      "application",
      `/api/application/nodes/${encode(nodeId)}/allocations`,
    );
  }

  override async getNodes(): Promise<Node[]> {
    return this.#cached("nodes:detailed", Pterodactyl.METADATA_TTL, async () => {
      const [nodes, servers] = await Promise.all([
        this.#nodes(),
        this.#list<PteroAppServer>(
          "application",
          "/api/application/servers",
        ),
      ]);

      const usage = new Map<
        string,
        { servers: number; memory: number; disk: number }
      >();

      for (const server of servers) {
        const key = String(server.node ?? "");
        const entry = usage.get(key) ?? { servers: 0, memory: 0, disk: 0 };
        entry.servers += 1;
        entry.memory += server.limits.memory;
        entry.disk += server.limits.disk;
        usage.set(key, entry);
      }

      return Promise.all(
        nodes.map(async (node) => {
          const allocated = usage.get(String(node.id)) ?? {
            servers: 0,
            memory: 0,
            disk: 0,
          };

          let allocations: number;
          try {
            allocations = (await this.#nodeAllocations(String(node.id))).filter(
              (entry) => entry.assigned === false,
            ).length;
          } catch {
            allocations = -1;
          }

          const memoryLimit = node.memory ?? 0;
          const diskLimit = node.disk ?? 0;
          const memoryFull =
            memoryLimit > 0 && allocated.memory >= memoryLimit;
          const diskFull = diskLimit > 0 && allocated.disk >= diskLimit;

          const reason = node.maintenance_mode
            ? "Node is in maintenance"
            : memoryFull
              ? "Memory is full"
              : diskFull
                ? "Disk is full"
                : allocations === 0
                  ? "No free allocations"
                  : undefined;

          return {
            id: String(node.id),
            name: node.name,
            memory: {
              allocated: allocated.memory,
              limit: memoryLimit,
            },
            disk: { allocated: allocated.disk, limit: diskLimit },
            servers: allocated.servers,
            allocations,
            available: reason === undefined,
            reason,
            deploymentEnabled: node.maintenance_mode !== true,
            maintenanceEnabled: node.maintenance_mode === true,
          };
        }),
      );
    });
  }

  override async updateNode(id: string, input: UpdateNode): Promise<Node> {
    const body: Record<string, unknown> = {};

    if (input.maintenanceEnabled !== undefined) {
      body.maintenance_mode = input.maintenanceEnabled;
    }

    if (input.deploymentEnabled === false) {
      body.maintenance_mode = true;
    } else if (input.deploymentEnabled === true && body.maintenance_mode === undefined) {
      body.maintenance_mode = false;
    }

    if (input.memory !== undefined) body.memory = input.memory;
    if (input.disk !== undefined) body.disk = input.disk;

    await this.#json(
      "application",
      `/api/application/nodes/${encode(id)}`,
      this.#jsonInit("PATCH", body),
    );

    this.#cache.delete("nodes");
    this.#cache.delete("nodes:detailed");

    const nodes = await this.getNodes();
    const node = nodes.find((entry) => entry.id === id);

    if (!node) {
      throw new AdapterError(`Node ${id} was not found`, "NOT_FOUND");
    }

    return node;
  }

  #nests(): Promise<PteroNest[]> {
    return this.#cached("nests", Pterodactyl.METADATA_TTL, () =>
      this.#list<PteroNest>("application", "/api/application/nests"),
    );
  }

  #eggs(): Promise<Array<{ nest: PteroNest; nestIndex: number; egg: PteroEgg }>> {
    return this.#cached("eggs", Pterodactyl.METADATA_TTL, async () => {
      const nests = await this.#nests();
      const lists = await Promise.all(
        nests.map((nest) =>
          this.#list<PteroEgg>(
            "application",
            `/api/application/nests/${encode(String(nest.id))}/eggs`,
          ),
        ),
      );

      return nests.flatMap((nest, nestIndex) =>
        (lists[nestIndex] ?? []).map((egg) => ({ nest, nestIndex, egg })),
      );
    });
  }

  async listSoftwares(): Promise<Software[]> {
    const eggs = await this.#eggs();

    return eggs.map(({ egg, nestIndex }, index) => {
      const images = Object.entries(egg.docker_images ?? {});
      const versions = images.length
        ? images.map(([key], versionIndex) => ({
            id: `${egg.uuid}:${key}`,
            name: key,
            latest: versionIndex === 0,
          }))
        : [{ id: egg.uuid, name: "latest", latest: true }];

      return {
        id: index,
        groupId: nestIndex,
        name: egg.name,
        description: egg.description ?? null,
        versions,
      };
    });
  }

  async listSoftwareGroups(): Promise<SoftwareGroup[]> {
    const nests = await this.#nests();

    return nests.map((nest, index) => ({
      id: index,
      name: nest.name,
      description: nest.description ?? null,
    }));
  }

  async #deployEgg(
    software: number,
    softwareGroup: number,
  ): Promise<{ nest: PteroNest; egg: PteroEgg }> {
    const eggs = await this.#eggs();
    const chosen = eggs[software];

    if (!chosen) {
      throw new AdapterError(`Unknown software: ${software}`, "VALIDATION");
    }

    if (chosen.nestIndex !== softwareGroup) {
      throw new AdapterError(
        `Software ${software} does not belong to group ${softwareGroup}`,
        "VALIDATION",
      );
    }

    return chosen;
  }

  override async getSoftwareVariables(
    softwareGroup: number,
    software: number,
  ): Promise<SoftwareVariable[]> {
    const { nest, egg } = await this.#deployEgg(software, softwareGroup);

    return this.#cached(
      `variables:${egg.uuid}`,
      Pterodactyl.METADATA_TTL,
      async () => {
        const response = await this.#resource<PteroEgg>(
          "application",
          `/api/application/nests/${encode(String(nest.id))}/eggs/${encode(String(egg.id))}?include=variables`,
        );

        const variables = (
          response.attributes.relationships?.variables?.data ?? []
        ).map((variable) => variable.attributes);

        return variables.map((variable) => ({
          key: variable.env_variable,
          name: variable.name ?? variable.env_variable,
          description: variable.description ?? "",
          defaultValue: variable.default_value ?? "",
          editable: variable.user_editable !== false,
        }));
      },
    );
  }

  override refreshCatalog(): void {
    this.#cache.delete("nests");
    this.#cache.delete("eggs");

    for (const key of this.#cache.keys()) {
      if (key.startsWith("variables:")) this.#cache.delete(key);
    }
  }

  async #resolveUserId(ownerId?: string): Promise<string> {
    const users = await this.#list<PteroUser>(
      "application",
      "/api/application/users",
    );

    if (ownerId) {
      const match = users.find(
        (user) =>
          String(user.id) === ownerId ||
          user.uuid === ownerId ||
          user.email === ownerId ||
          user.username === ownerId,
      );

      if (match) return String(match.id);
    }

    const fallback = users.find((user) => user.root_admin) ?? users[0];

    if (!fallback) {
      throw new AdapterError(
        "No Pterodactyl user is available to own the server.",
        "NOT_FOUND",
      );
    }

    return String(fallback.id);
  }

  async #nodeForDeployment(nodeRef?: string): Promise<Node> {
    const nodes = await this.getNodes();

    if (nodeRef) {
      const selected = nodes.find(
        (node) => node.id === nodeRef || node.name === nodeRef,
      );

      if (!selected) {
        throw new AdapterError(`Unknown node: ${nodeRef}`, "NOT_FOUND");
      }

      if (!selected.available) {
        throw new AdapterError(
          `${selected.name} is unavailable: ${selected.reason ?? "node is full"}`,
          "VALIDATION",
        );
      }

      return selected;
    }

    const node = nodes.find((candidate) => candidate.available);

    if (!node) {
      throw new AdapterError("No nodes available", "NOT_FOUND");
    }

    return node;
  }

  async #allocationsForNode(
    nodeId: string,
    count: number,
  ): Promise<PteroAllocation[]> {
    const allocations = (await this.#nodeAllocations(nodeId)).filter(
      (allocation) => allocation.assigned === false,
    );

    const requested = Math.max(1, count);

    if (allocations.length < requested) {
      throw new AdapterError(
        allocations.length === 0
          ? "No available allocations on this node"
          : `This node only has ${allocations.length} free allocation${allocations.length === 1 ? "" : "s"}, but ${requested} were requested`,
        "NOT_FOUND",
      );
    }

    return allocations.slice(0, requested);
  }

  async createServer(input: CreateServer): Promise<Server> {
    if (input.software === undefined || input.softwareGroup === undefined) {
      throw new AdapterError(
        "An egg (software) and nest (softwareGroup) are required to create a server",
        "VALIDATION",
      );
    }

    const [{ egg }, node, owner, variables] = await Promise.all([
      this.#deployEgg(input.software, input.softwareGroup),
      this.#nodeForDeployment(input.node),
      this.#resolveUserId(input.ownerId),
      this.getSoftwareVariables(input.software, input.softwareGroup).catch(
        () => [] as SoftwareVariable[],
      ),
    ]);

    const ram = input.ram ?? DEFAULT_SERVER_LIMITS.memory;
    const disk = input.disk ?? DEFAULT_SERVER_LIMITS.disk;
    const freeMemory = Math.max(0, node.memory.limit - node.memory.allocated);
    const freeDisk = Math.max(0, node.disk.limit - node.disk.allocated);

    if (node.memory.limit > 0 && ram > freeMemory) {
      throw new AdapterError(
        `Requested memory (${ram} MB) exceeds the ${freeMemory} MB still available on ${node.name}`,
        "VALIDATION",
      );
    }

    if (node.disk.limit > 0 && disk > freeDisk) {
      throw new AdapterError(
        `Requested disk (${disk} MB) exceeds the ${freeDisk} MB still available on ${node.name}`,
        "VALIDATION",
      );
    }

    const extraAllocations = Math.max(0, Math.floor(input.allocations ?? 0));
    const allocations = await this.#allocationsForNode(
      node.id,
      1 + extraAllocations,
    );
    const [primaryAllocation, ...additionalAllocations] = allocations;

    if (!primaryAllocation) {
      throw new AdapterError("No available allocations on this node", "NOT_FOUND");
    }

    const environment = new Map(
      variables.map((variable) => [
        variable.key,
        input.variables?.[variable.key] ?? variable.defaultValue,
      ]),
    );

    for (const [key, value] of Object.entries(input.variables ?? {})) {
      environment.set(key, value);
    }

    const response = await this.#resource<PteroAppServer>(
      "application",
      "/api/application/servers",
      this.#jsonInit("POST", {
        name: input.name,
        description: input.description ?? null,
        user: Number(owner),
        egg: egg.id,
        docker_image:
          input.image ??
          Object.values(egg.docker_images ?? {})[0] ??
          "",
        startup: input.startup ?? egg.startup ?? "",
        environment: Object.fromEntries(environment),
        limits: {
          memory: ram,
          swap: 0,
          disk,
          io: 500,
          cpu: input.cpu ?? DEFAULT_SERVER_LIMITS.cpu,
          threads: null,
        },
        feature_limits: {
          databases:
            input.databases === undefined
              ? 0
              : Math.max(0, Math.floor(input.databases)),
          allocations: 1 + extraAllocations,
          backups: 2,
        },
        allocation: {
          default: primaryAllocation.id,
          additional: additionalAllocations.map((entry) => entry.id),
        },
        start_on_completion: true,
      }),
    );

    this.#remember(response.attributes);

    return this.getServer(String(response.attributes.id)).catch(() =>
      this.#toServer(response.attributes),
    );
  }

  override async updateServer(
    id: string,
    input: UpdateServer,
  ): Promise<Server> {
    const resolved = await this.#resolveServer(id);
    const current = await this.#appServer(resolved.appId);
    const limits = current.limits;

    if (input.name !== undefined || input.description !== undefined) {
      await this.#json(
        "application",
        `/api/application/servers/${encode(resolved.appId)}/details`,
        this.#jsonInit("PATCH", {
          name: input.name ?? current.name,
          description: input.description ?? current.description ?? null,
          user: current.user,
        }),
      );
    }

    if (
      input.ram !== undefined ||
      input.disk !== undefined ||
      input.cpu !== undefined ||
      input.databases !== undefined ||
      input.allocations !== undefined
    ) {
      await this.#json(
        "application",
        `/api/application/servers/${encode(resolved.appId)}/build`,
        this.#jsonInit("PATCH", {
          allocation: current.allocation,
          memory: input.ram ?? limits.memory,
          swap: limits.swap ?? 0,
          disk: input.disk ?? limits.disk,
          io: limits.io ?? 500,
          cpu: input.cpu ?? limits.cpu,
          threads: limits.threads ?? null,
          feature_limits: {
            databases:
              input.databases ??
              current.feature_limits?.databases ??
              0,
            allocations:
              input.allocations ??
              current.feature_limits?.allocations ??
              1,
            backups: current.feature_limits?.backups ?? 2,
          },
        }),
      );
    }

    return this.getServer(resolved.appId);
  }

  override async deleteServer(id: string): Promise<void> {
    const resolved = await this.#resolveServer(id);

    await this.#json(
      "application",
      `/api/application/servers/${encode(resolved.appId)}?force=true`,
      this.#jsonInit("DELETE"),
    );

    this.#servers.delete(id);
    this.#servers.delete(resolved.appId);
    this.#servers.delete(resolved.identifier);
  }

  override async suspendServer(id: string): Promise<void> {
    const resolved = await this.#resolveServer(id);
    await this.#json(
      "application",
      `/api/application/servers/${encode(resolved.appId)}/suspend`,
      this.#jsonInit("POST", {}),
    );
  }

  override async unsuspendServer(id: string): Promise<void> {
    const resolved = await this.#resolveServer(id);
    await this.#json(
      "application",
      `/api/application/servers/${encode(resolved.appId)}/unsuspend`,
      this.#jsonInit("POST", {}),
    );
  }

  async #power(id: string, action: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);
    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/power`,
      this.#jsonInit("POST", { signal: action }),
    );
  }

  override async startServer(id: string): Promise<void> {
    await this.#power(id, "start");
  }

  override async stopServer(id: string): Promise<void> {
    await this.#power(id, "stop");
  }

  override async restartServer(id: string): Promise<void> {
    await this.#power(id, "restart");
  }

  override async killServer(id: string): Promise<void> {
    await this.#power(id, "kill");
  }

  override async reinstallServer(id: string): Promise<void> {
    const resolved = await this.#resolveServer(id);
    await this.#json(
      "application",
      `/api/application/servers/${encode(resolved.appId)}/reinstall`,
      this.#jsonInit("POST", {}),
    );
  }

  override async sendCommand(id: string, command: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);
    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/command`,
      this.#jsonInit("POST", { command }),
    );
  }

  override async getResources(id: string): Promise<ResourceUsage> {
    const { identifier } = await this.#resolveServer(id);
    const usage = await this.#resourcesForIdentifier(identifier);

    if (!usage) {
      this.unsupported("getResources");
    }

    return usage;
  }

  override async getWebsocket(id: string): Promise<WebsocketCredentials> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#json<{
      data?: { token?: string; socket?: string };
    }>(
      "client",
      `/api/client/servers/${encode(identifier)}/websocket`,
    );

    if (!response.data?.socket || !response.data.token) {
      throw new AdapterError(
        "The panel did not return websocket credentials.",
        "UNKNOWN",
      );
    }

    return { url: response.data.socket, token: response.data.token };
  }

  override async listFiles(
    id: string,
    directory: string,
  ): Promise<FileEntry[]> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#json<PteroList<PteroFile>>(
      "client",
      `/api/client/servers/${encode(identifier)}/files/list?directory=${encode(this.#panelPath(directory))}`,
    );

    return (response.data ?? []).map((resource) => {
      const entry = resource.attributes;
      const archive = /\.(tar\.gz|zip|gz|tgz|rar|7z)$/i.test(entry.name);

      return {
        name: entry.name,
        type: entry.is_file ? "file" : "dir",
        size: entry.is_file ? entry.size : null,
        modified: entry.modified_at,
        actions: entry.is_file
          ? archive
            ? ["decompress", "download", "copy", "delete"]
            : ["edit", "download", "copy", "compress", "delete"]
          : ["open", "copy", "compress", "delete"],
      };
    });
  }

  override async getFileSystem(id: string): Promise<FileSystem> {
    const entries = await this.listFiles(id, FILES_ROOT);
    return { tree: { [FILES_ROOT]: entries } };
  }

  override async readFile(id: string, path: string): Promise<string> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#send(
      "client",
      `/api/client/servers/${encode(identifier)}/files/contents?file=${encode(this.#panelPath(path))}`,
    );

    return response.text();
  }

  override async writeFile(
    id: string,
    path: string,
    content: string,
  ): Promise<void> {
    const { identifier } = await this.#resolveServer(id);
    await this.#send(
      "client",
      `/api/client/servers/${encode(identifier)}/files/write?file=${encode(this.#panelPath(path))}`,
      {
        method: "POST",
        body: content,
        headers: { "Content-Type": "text/plain" },
      },
    );
  }

  override async createFile(
    id: string,
    directory: string,
    name: string,
  ): Promise<FileEntry> {
    const path = `${directory.replace(/\/+$/, "")}/${name}`;
    await this.writeFile(id, path, "");

    return {
      name,
      type: "file",
      size: 0,
      modified: new Date().toISOString(),
      content: "",
      actions: ["edit", "download", "copy", "compress", "delete"],
    };
  }

  override async createDirectory(
    id: string,
    directory: string,
    name: string,
  ): Promise<FileEntry> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/files/create-folder`,
      this.#jsonInit("POST", {
        root: this.#panelPath(directory),
        name,
      }),
    );

    return {
      name,
      type: "dir",
      size: null,
      modified: new Date().toISOString(),
      actions: ["open", "copy", "compress", "delete"],
    };
  }

  override async deleteFiles(id: string, paths: string[]): Promise<void> {
    const { identifier } = await this.#resolveServer(id);
    const groups = new Map<string, string[]>();

    for (const path of paths) {
      const root = parentOf(path);
      const files = groups.get(root) ?? [];
      files.push(basenameOf(path));
      groups.set(root, files);
    }

    await Promise.all(
      [...groups].map(([root, files]) =>
        this.#json(
          "client",
          `/api/client/servers/${encode(identifier)}/files/delete`,
          this.#jsonInit("POST", {
            root: this.#panelPath(root),
            files,
          }),
        ),
      ),
    );
  }

  override async renameFile(
    id: string,
    from: string,
    to: string,
  ): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/files/rename`,
      this.#jsonInit("POST", {
        root: this.#panelPath(parentOf(from)),
        files: [{ from: basenameOf(from), to: basenameOf(to) }],
      }),
    );
  }

  override async copyFile(id: string, from: string, to: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/files/copy`,
      this.#jsonInit("POST", {
        location: this.#panelPath(parentOf(to)),
        files: [basenameOf(from)],
      }),
    );
  }

  override async compressFiles(
    id: string,
    paths: string[],
    name: string,
  ): Promise<FileEntry> {
    const { identifier } = await this.#resolveServer(id);
    const first = paths[0] ?? FILES_ROOT;

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/files/compress`,
      this.#jsonInit("POST", {
        root: this.#panelPath(parentOf(first)),
        files: paths.map((path) => basenameOf(path)),
      }),
    );

    return {
      name: name || `${basenameOf(first)}.tar.gz`,
      type: "file",
      size: null,
      modified: new Date().toISOString(),
      actions: ["decompress", "download", "delete"],
    };
  }

  override async decompressFile(id: string, path: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/files/decompress`,
      this.#jsonInit("POST", {
        root: this.#panelPath(parentOf(path)),
        file: basenameOf(path),
      }),
    );
  }

  override async getFileDownloadUrl(
    id: string,
    path: string,
  ): Promise<string | null> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<{ url?: string }>(
      "client",
      `/api/client/servers/${encode(identifier)}/files/download?file=${encode(this.#panelPath(path))}`,
    );

    return response.attributes.url ?? null;
  }

  override async uploadFiles(
    id: string,
    directory: string,
    files: UploadFile[],
  ): Promise<FileEntry[]> {
    if (files.length === 0) return [];

    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<{ url?: string }>(
      "client",
      `/api/client/servers/${encode(identifier)}/files/upload`,
    );

    if (!response.attributes.url) {
      throw new AdapterError(
        "The panel did not return an upload URL.",
        "UNKNOWN",
      );
    }

    const endpoint = new URL(response.attributes.url, this.url);
    endpoint.searchParams.set("directory", this.#panelPath(directory));

    const form = new FormData();

    for (const file of files) {
      const content = file.content ?? "";
      const body =
        typeof content === "string" ? content : new Uint8Array(content);
      form.append("files", new Blob([body as BlobPart]), file.name);
    }

    let upload: Response;
    try {
      upload = await fetchWithTimeout(
        endpoint,
        { method: "POST", body: form },
        300_000,
      );
    } catch {
      throw new AdapterError("Unable to upload the file", "NETWORK");
    }

    if (!upload.ok) {
      const details = await upload.text().catch(() => "");
      throw new AdapterError(
        details || `The panel rejected the upload (${upload.status})`,
        errorForStatus(upload.status),
        upload.status,
      );
    }

    return files.map((file) => ({
      name: file.name,
      type: "file" as const,
      size: file.size,
      modified: new Date().toISOString(),
      actions: ["edit", "download", "copy", "compress", "delete"],
    }));
  }

  override async downloadToServer(
    id: string,
    directory: string,
    filename: string,
    url: string,
  ): Promise<FileEntry> {
    let download: Response;

    try {
      download = await fetchWithTimeout(url, {}, 60_000);
    } catch {
      throw new AdapterError("Unable to download the addon file", "NETWORK");
    }

    if (!download.ok) {
      throw new AdapterError(
        `The addon source returned ${download.status}`,
        errorForStatus(download.status),
        download.status,
      );
    }

    const body = await download.arrayBuffer();
    if (body.byteLength > 100 * 1024 * 1024) {
      throw new AdapterError(
        "Addon files larger than 100 MB are not supported",
        "VALIDATION",
      );
    }

    const [entry] = await this.uploadFiles(id, directory, [
      {
        name: filename,
        size: body.byteLength,
        content: new Uint8Array(body),
      },
    ]);

    if (!entry) {
      throw new AdapterError("The addon could not be written to the server");
    }

    return entry;
  }

  override async listBackups(id: string): Promise<Backup[]> {
    const { identifier } = await this.#resolveServer(id);
    const backups = await this.#list<PteroBackup>(
      "client",
      `/api/client/servers/${encode(identifier)}/backups`,
    );

    return backups.map((backup) => this.#toBackup(backup));
  }

  #toBackup(backup: PteroBackup): Backup {
    return {
      id: backup.uuid,
      name: backup.name,
      size: backup.bytes,
      createdAt:
        backup.completed_at ?? backup.created_at ?? new Date(0).toISOString(),
      status: backup.is_successful
        ? "completed"
        : backup.completed_at
          ? "failed"
          : "running",
      actions: ["download", "restore", "delete"],
    };
  }

  override async createBackup(
    id: string,
    input?: CreateBackup,
  ): Promise<Backup> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroBackup>(
      "client",
      `/api/client/servers/${encode(identifier)}/backups`,
      this.#jsonInit("POST", {
        name: input?.name ?? null,
        ignored_files: [],
      }),
    );

    return this.#toBackup(response.attributes);
  }

  override async deleteBackup(id: string, backupId: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/backups/${encode(backupId)}`,
      this.#jsonInit("DELETE"),
    );
  }

  override async restoreBackup(id: string, backupId: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/backups/${encode(backupId)}/restore`,
      this.#jsonInit("POST", { truncate: false }),
    );
  }

  override async getBackupDownloadUrl(
    id: string,
    backupId: string,
  ): Promise<string | null> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<{ url?: string }>(
      "client",
      `/api/client/servers/${encode(identifier)}/backups/${encode(backupId)}/download`,
    );

    return response.attributes.url ?? null;
  }

  #toDatabase(database: PteroDatabase): Database {
    return {
      id: String(database.id),
      name: database.name,
      username: database.username,
      host: database.host?.address ?? "",
      port: database.host?.port ?? 3306,
      actions: ["delete"],
    };
  }

  override async listDatabases(id: string): Promise<Database[]> {
    const { identifier } = await this.#resolveServer(id);
    const databases = await this.#list<PteroDatabase>(
      "client",
      `/api/client/servers/${encode(identifier)}/databases`,
    );

    return databases.map((database) => this.#toDatabase(database));
  }

  override async createDatabase(
    id: string,
    input: CreateDatabase,
  ): Promise<Database> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroDatabase>(
      "client",
      `/api/client/servers/${encode(identifier)}/databases`,
      this.#jsonInit("POST", {
        database: input.name,
        remote: "%",
      }),
    );

    return this.#toDatabase(response.attributes);
  }

  override async deleteDatabase(id: string, databaseId: string): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/databases/${encode(databaseId)}`,
      this.#jsonInit("DELETE"),
    );
  }

  #toAllocation(allocation: PteroAllocation): Allocation {
    const primary = allocation.is_default === true;

    return {
      id: String(allocation.id),
      ip: allocation.ip_alias || allocation.ip,
      port: allocation.port,
      primary,
      notes: allocation.notes ?? null,
      actions: primary ? [] : ["primary", "delete"],
    };
  }

  override async listAllocations(id: string): Promise<Allocation[]> {
    const { identifier } = await this.#resolveServer(id);

    return this.#cached(`allocations:${identifier}`, 10_000, async () => {
      const allocations = await this.#list<PteroAllocation>(
        "client",
        `/api/client/servers/${encode(identifier)}/allocations`,
      );

      return allocations.map((allocation) => this.#toAllocation(allocation));
    });
  }

  override async createAllocation(id: string): Promise<Allocation> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroAllocation>(
      "client",
      `/api/client/servers/${encode(identifier)}/allocations`,
      this.#jsonInit("POST", {}),
    );

    this.#cache.delete(`allocations:${identifier}`);
    return this.#toAllocation(response.attributes);
  }

  override async deleteAllocation(
    id: string,
    allocationId: string,
  ): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/allocations/${encode(allocationId)}`,
      this.#jsonInit("DELETE"),
    );

    this.#cache.delete(`allocations:${identifier}`);
  }

  override async setPrimaryAllocation(
    id: string,
    allocationId: string,
  ): Promise<Allocation[]> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/allocations/${encode(allocationId)}`,
      this.#jsonInit("POST", {}),
    );

    this.#cache.delete(`allocations:${identifier}`);
    return this.listAllocations(id);
  }

  #scheduleCron(schedule: PteroSchedule): string {
    const { minute, hour, day_of_month, month, day_of_week } = schedule.cron;
    return [minute, hour, day_of_month, month, day_of_week].join(" ");
  }

  #parseCron(cron: string): PteroSchedule["cron"] {
    const [minute = "*", hour = "*", day_of_month = "*", month = "*", day_of_week = "*"] =
      cron.trim().split(/\s+/);

    return { minute, hour, day_of_month, month, day_of_week };
  }

  #taskAction(task?: PteroTask): ScheduleAction {
    if (!task) return "start";
    if (task.action === "power") return task.payload || "start";
    if (task.action === "backup") return "backup run";
    if (task.action === "command") return task.payload || "";
    return task.action;
  }

  #actionTask(action: ScheduleAction): PteroTask {
    if (POWER_ACTIONS.has(action)) {
      return { action: "power", payload: action, sequence_id: 1 };
    }

    if (action === "backup run") {
      return { action: "backup", payload: "", sequence_id: 1 };
    }

    return { action: "command", payload: action, sequence_id: 1 };
  }

  #toSchedule(schedule: PteroSchedule): Schedule {
    const task = schedule.relationships?.tasks?.data?.[0]?.attributes;

    return {
      id: String(schedule.id),
      name: schedule.name,
      cron: this.#scheduleCron(schedule),
      action: this.#taskAction(task),
      enabled: schedule.is_active,
      lastRun: schedule.last_run_at ?? null,
      nextRun: schedule.next_run_at ?? "",
      actions: ["toggle", "delete"],
    };
  }

  override async listSchedules(id: string): Promise<Schedule[]> {
    const { identifier } = await this.#resolveServer(id);
    const schedules = await this.#list<PteroSchedule>(
      "client",
      `/api/client/servers/${encode(identifier)}/schedules`,
      { include: "tasks" },
    );

    return schedules.map((schedule) => this.#toSchedule(schedule));
  }

  override async createSchedule(
    id: string,
    input: CreateSchedule,
  ): Promise<Schedule> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroSchedule>(
      "client",
      `/api/client/servers/${encode(identifier)}/schedules`,
      this.#jsonInit("POST", {
        name: input.name,
        is_active: input.enabled ?? true,
        only_when_online: false,
        cron: this.#parseCron(input.cron),
        tasks: [this.#actionTask(input.action)],
      }),
    );

    const schedule = await this.#findSchedule(identifier, response.attributes.id);
    return schedule ?? this.#toSchedule(response.attributes);
  }

  async #findSchedule(
    identifier: string,
    scheduleId: number,
  ): Promise<Schedule | null> {
    const schedules = await this.#list<PteroSchedule>(
      "client",
      `/api/client/servers/${encode(identifier)}/schedules`,
      { include: "tasks" },
    );

    const match = schedules.find((schedule) => schedule.id === scheduleId);
    return match ? this.#toSchedule(match) : null;
  }

  override async updateSchedule(
    id: string,
    scheduleId: string,
    input: UpdateSchedule,
  ): Promise<Schedule> {
    const { identifier } = await this.#resolveServer(id);
    const current = await this.#findSchedule(identifier, Number(scheduleId));
    const currentRaw = current
      ? await this.#json<PteroResource<PteroSchedule>>(
          "client",
          `/api/client/servers/${encode(identifier)}/schedules/${encode(scheduleId)}?include=tasks`,
        )
      : null;

    const existingTasks = (
      currentRaw?.attributes.relationships?.tasks?.data ?? []
    ).map((task) => task.attributes);

    const tasks = input.action
      ? [this.#actionTask(input.action)]
      : existingTasks.map((task, index) => ({
          ...task,
          sequence_id: task.sequence_id ?? index + 1,
        }));

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/schedules/${encode(scheduleId)}`,
      this.#jsonInit("POST", {
        name: input.name ?? current?.name ?? "Schedule",
        is_active: input.enabled ?? current?.enabled ?? true,
        only_when_online: false,
        cron: this.#parseCron(input.cron ?? current?.cron ?? "* * * * *"),
        tasks,
      }),
    );

    const updated = await this.#findSchedule(identifier, Number(scheduleId));

    if (!updated) {
      throw new AdapterError("Schedule was not found", "NOT_FOUND");
    }

    return updated;
  }

  override async deleteSchedule(
    id: string,
    scheduleId: string,
  ): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/schedules/${encode(scheduleId)}`,
      this.#jsonInit("DELETE"),
    );
  }

  override async getStartup(id: string): Promise<Startup> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroStartup>(
      "client",
      `/api/client/servers/${encode(identifier)}/startup`,
    );

    const variables = (
      response.attributes.relationships?.variables?.data ?? []
    ).map((variable) => variable.attributes);

    return {
      image: Object.values(response.attributes.docker_images ?? {})[0] ?? "",
      command: response.attributes.startup_command ?? "",
      variables: variables.map((variable) => ({
        key: variable.env_variable,
        name: variable.name || variable.env_variable,
        description: variable.description ?? "",
        value: variable.server_value ?? variable.default_value ?? "",
        editable: variable.is_editable !== false,
      })),
    };
  }

  override async updateStartup(
    id: string,
    input: UpdateStartup,
  ): Promise<Startup> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/startup`,
      this.#jsonInit(
        "PUT",
        Object.fromEntries(
          input.variables.map((variable) => [variable.key, variable.value]),
        ),
      ),
    );

    return this.getStartup(id);
  }

  #toSubuser(raw: PteroSubuser): Subuser {
    return {
      id: raw.uuid,
      username: raw.username,
      email: raw.email,
      permissions: raw.permissions ?? [],
      addedAt: raw.created_at ?? new Date(0).toISOString(),
      actions: ["update", "delete"],
    };
  }

  override async listSubusers(id: string): Promise<Subuser[]> {
    const { identifier } = await this.#resolveServer(id);
    const subusers = await this.#list<PteroSubuser>(
      "client",
      `/api/client/servers/${encode(identifier)}/users`,
    );

    return subusers.map((subuser) => this.#toSubuser(subuser));
  }

  override async createSubuser(
    id: string,
    input: CreateSubuser,
  ): Promise<Subuser> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroSubuser>(
      "client",
      `/api/client/servers/${encode(identifier)}/users`,
      this.#jsonInit("POST", {
        email: input.email,
        permissions: input.permissions ?? [],
      }),
    );

    return this.#toSubuser(response.attributes);
  }

  override async updateSubuser(
    id: string,
    subuserId: string,
    input: UpdateSubuser,
  ): Promise<Subuser> {
    const { identifier } = await this.#resolveServer(id);
    const response = await this.#resource<PteroSubuser>(
      "client",
      `/api/client/servers/${encode(identifier)}/users/${encode(subuserId)}`,
      this.#jsonInit("POST", { permissions: input.permissions }),
    );

    return this.#toSubuser(response.attributes);
  }

  override async deleteSubuser(
    id: string,
    subuserId: string,
  ): Promise<void> {
    const { identifier } = await this.#resolveServer(id);

    await this.#json(
      "client",
      `/api/client/servers/${encode(identifier)}/users/${encode(subuserId)}`,
      this.#jsonInit("DELETE"),
    );
  }

  override async listPermissionGroups(): Promise<PermissionGroup[]> {
    return this.#cached(
      "permission-groups",
      Pterodactyl.METADATA_TTL,
      async () => {
        const response = await this.#json<{
          attributes?: {
            permissions?: Record<string, Record<string, string> | string[]>;
          };
          permissions?: Record<string, Record<string, string> | string[]>;
        }>("client", "/api/client/permissions");

        const groups =
          response.attributes?.permissions ?? response.permissions ?? {};

        return Object.entries(groups).map(([key, value]) => ({
          key,
          description: "",
          permissions: Array.isArray(value)
            ? value.map((permission) => ({
                key: `${key}.${permission}`,
                description: "",
              }))
            : Object.entries(value).map(([permission, description]) => ({
                key: `${key}.${permission}`,
                description:
                  typeof description === "string" ? description : "",
              })),
        }));
      },
    );
  }

  override async listActivities(id: string): Promise<Activity[]> {
    const { identifier } = await this.#resolveServer(id);
    const activities = await this.#list<PteroActivity>(
      "client",
      `/api/client/servers/${encode(identifier)}/activity`,
    );

    return activities.map((activity) => ({
      id: String(activity.id),
      actor:
        activity.relationships?.actor?.attributes?.username ??
        activity.relationships?.actor?.attributes?.email ??
        "System",
      event: activity.event,
      detail: activity.description ?? "",
      ip: activity.ip_address ?? "",
      timestamp: activity.timestamp ?? new Date(0).toISOString(),
    }));
  }

  override async getPanelPrompts(
    scope: PanelScope,
    serverId?: string,
    context?: { output?: string },
  ): Promise<PanelPrompt[]> {
    if (scope !== "server" || !serverId || !this.capabilities.files.read) {
      return [];
    }

    const output = context?.output;
    const mentionsEula = output
      ? /you need to agree to the eula|go to eula\.txt|agree to the eula/i.test(
          output,
        )
      : false;

    if (output && !mentionsEula) return [];

    let content: string | null = null;

    try {
      content = await this.readFile(serverId, "/eula.txt");
    } catch {
      content = null;
    }

    if (content !== null && /eula\s*=\s*true/i.test(content)) return [];
    if (!output && content === null) return [];

    return [
      {
        id: `minecraft-eula:${serverId}`,
        scope: "server",
        serverId,
        title: "Minecraft EULA required",
        message:
          "This server stopped because the Minecraft EULA has not been accepted. You must agree to the Minecraft EULA before it can start.",
        tone: "warning",
        link: {
          label: "Minecraft EULA",
          href: "https://www.minecraft.net/en-us/eula",
        },
        confirmLabel: "Accept & start",
        cancelLabel: "Later",
        actionId: "accept",
        dismissible: true,
      },
    ];
  }

  override async runPanelAction(
    request: PanelActionRequest,
  ): Promise<PanelActionResult> {
    if (
      request.scope === "server" &&
      request.serverId &&
      request.promptId?.startsWith("minecraft-eula") &&
      request.actionId === "accept"
    ) {
      await this.writeFile(request.serverId, "/eula.txt", "eula=true\n");

      try {
        await this.startServer(request.serverId);
      } catch (cause) {
        if (
          !(cause instanceof AdapterError) ||
          !/already|running|starting/i.test(cause.message)
        ) {
          throw cause;
        }
      }

      return {
        message: "EULA accepted. Starting server.",
        refresh: true,
      };
    }

    this.unsupported("runPanelAction");
  }
}

export { Pterodactyl as PterodactylAdapter };
