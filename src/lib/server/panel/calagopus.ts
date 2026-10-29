import { FetchTimeoutError, fetchWithTimeout } from "#lib/http.ts";
import {
  Adapter,
  AdapterError,
  DEFAULT_SERVER_LIMITS,
  FILES_ROOT,
  type AdapterCapabilities,
  type Allocation,
  type Backup,
  type ConsoleLine,
  type CreateBackup,
  type CreateDatabase,
  type CreateServer,
  type Database,
  type FileEntry,
  type Node,
  type PanelActionRequest,
  type PanelActionResult,
  type PanelErrorCode,
  type PanelPrompt,
  type PanelScope,
  type ResourceUsage,
  type Server,
  type Software,
  type SoftwareGroup,
  type SoftwareVariable,
  type UpdateServer,
  type UpdateNode,
  type User,
  type WebsocketCredentials,
} from "#lib/adapter/sdk.ts";

type CalagopusUser = {
  uuid: string;
  username: string;
  email: string;
  admin: boolean;
};

type CalagopusServerLimits = {
  cpu: number;
  memory: number;
  memory_overhead?: number;
  swap: number;
  disk: number;
  io_weight?: number | null;
};

type CalagopusServerFeatureLimits = {
  allocations?: number;
  databases?: number;
  backups?: number;
  schedules?: number;
};

type CalagopusServer = {
  uuid: string;
  uuid_short: string;
  name: string;
  description?: string | null;
  status?: string | null;
  is_suspended: boolean;
  is_transferring?: boolean;
  limits: CalagopusServerLimits;
  feature_limits?: CalagopusServerFeatureLimits;
  node?: { name?: string } | null;
  node_name?: string;
  owner?: { uuid?: string; email?: string } | null;
  egg?: { name?: string } | null;
  image?: string | null;
  allocation?: { ip?: string; port?: number } | null;
};

type CalagopusNest = {
  uuid: string;
  name: string;
  description?: string | null;
};

type CalagopusEgg = {
  uuid: string;
  name: string;
  description?: string | null;
  startup_commands?: Record<string, string>;
  docker_images?: Record<string, string>;
};

type CalagopusVariable = {
  env_variable: string;
  name?: string | null;
  description?: string | null;
  default_value?: string | null;
  user_editable?: boolean | null;
  user_viewable?: boolean | null;
};

type CalagopusNode = {
  uuid: string;
  name: string;
  deployment_enabled?: boolean;
  maintenance_enabled?: boolean;
  memory?: number;
  disk?: number;
};

type CalagopusCapacity = {
  servers: number;
  cpu: number;
  memory: number;
  memory_overhead: number;
  disk: number;
};

type CalagopusAllocation = {
  uuid: string;
  ip: string;
  port: number;
  notes?: string | null;
  is_primary?: boolean;
  is_default?: boolean;
};

type CalagopusFileEntry = {
  name: string;
  directory: boolean;
  size: number;
  modified: string;
};

type CalagopusBackup = {
  uuid: string;
  name: string;
  bytes: number;
  completed?: string | null;
  is_successful: boolean;
};

type CalagopusDatabaseHost = {
  uuid: string;
};

type CalagopusDatabase = {
  uuid: string;
  name: string;
  username: string;
  host: string;
  port: number;
};

type CalagopusResources = {
  memory_bytes: number;
  disk_bytes: number;
  state: string;
  cpu_absolute: number;
  uptime: number;
};

type Paginated<T> = { total?: number; page?: number; data?: T[] };

const MEGABYTE = 1024 * 1024;

const STATUS_MAP: Record<string, Server["state"]> = {
  offline: "offline",
  starting: "starting",
  stopping: "stopping",
  running: "running",
  installing: "installing",
  suspended: "suspended",
};

function errorForStatus(status: number): PanelErrorCode {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

export class Calagopus extends Adapter {
  private static readonly PER_PAGE = 100;
  private static readonly METADATA_TTL = 60_000;

  #cache = new Map<string, { expires: number; promise: Promise<unknown> }>();

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

  readonly capabilities: AdapterCapabilities = {
    servers: {
      list: true,
      create: true,
      update: true,
      delete: true,
      suspend: false,
      power: true,
    },
    console: { commands: true, history: true, websocket: true },
    files: { read: true, write: true, upload: false, manage: false },
    allocations: true,
    backups: true,
    databases: true,
    schedules: false,
    startup: false,
    subusers: false,
    activities: false,
    resources: true,
    accounts: { link: true, create: true },
    nodes: { list: true, update: true },
  };

  async connect(): Promise<boolean> {
    try {
      await this.request("/api/admin/users?page=1&per_page=1");
      return true;
    } catch {
      return false;
    }
  }

  protected override async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.#http(path, init);

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AdapterError(
        "Malformed JSON response",
        "UNKNOWN",
        response.status,
      );
    }
  }

  async #http(path: string, init: RequestInit = {}): Promise<Response> {
    const endpoint = new URL(path, this.url);

    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.token}`,
        },
      });
    } catch (cause) {
      if (cause instanceof FetchTimeoutError) {
        throw new AdapterError(cause.message, "NETWORK");
      }

      throw new AdapterError("Network request failed", "NETWORK");
    }

    if (!response.ok) {
      const details = await response
        .json()
        .then((body: { errors?: string[] }) => body?.errors?.join(", "))
        .catch(() => null);
      throw new AdapterError(
        details ?? `Request failed with status ${response.status}`,
        errorForStatus(response.status),
        response.status,
      );
    }

    return response;
  }

  async #requestText(path: string, init: RequestInit = {}): Promise<string> {
    const response = await this.#http(path, init);
    return response.text();
  }

  async #jsonRequest(
    path: string,
    method: string,
    body: unknown,
  ): Promise<Response> {
    return this.#http(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  async #list<T>(path: string, wrapper: string): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    for (;;) {
      const separator = path.includes("?") ? "&" : "?";
      const response = await this.request<{
        [key: string]: Paginated<T> | unknown;
      }>(`${path}${separator}page=${page}&per_page=${Calagopus.PER_PAGE}`);

      const wrapped = (response as Record<string, unknown>)[wrapper] as
        Paginated<T> | undefined;

      if (!wrapped || !wrapped.data || wrapped.data.length === 0) break;

      items.push(...wrapped.data);
      if (wrapped.total !== undefined && items.length >= wrapped.total) break;

      page += 1;
    }

    return items;
  }

  #toServer(raw: CalagopusServer, usage: ResourceUsage | null): Server {
    const rawStatus = raw.status ? STATUS_MAP[raw.status] : undefined;
    const status =
      raw.is_suspended || raw.status === "suspended"
        ? "suspended"
        : (usage?.state ?? rawStatus ?? "offline");

    const actions: Server["actions"] =
      status === "running"
        ? ["restart", "stop", "kill"]
        : status === "offline"
          ? ["start"]
          : status === "suspended"
            ? []
            : ["stop", "kill"];

    return {
      id: raw.uuid,
      identifier: raw.uuid_short,
      name: raw.name,
      description: raw.description ?? "",
      node: raw.node?.name ?? raw.node_name ?? "",
      image: raw.image ?? "",
      version: "",
      state: status,
      cpu: {
        used: usage?.cpu ?? 0,
        limit: raw.limits.cpu,
      },
      memory: {
        used: usage?.ram ?? 0,
        limit: raw.limits.memory,
      },
      disk: {
        used: usage?.disk ?? 0,
        limit: raw.limits.disk,
      },
      databaseLimit: raw.feature_limits?.databases,
      allocationLimit: raw.feature_limits?.allocations,
      actions,
      ownerId: raw.owner?.uuid,
    };
  }

  override async getCurrentUser(): Promise<User> {
    return this.#cached("user", Calagopus.METADATA_TTL, async () => {
      const response = await this.request<{ user: CalagopusUser }>(
        "/api/client/account",
      );

      return {
        id: response.user.uuid,
        username: response.user.username,
        email: response.user.email,
        isAdmin: response.user.admin,
      };
    });
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

  async getServers(ownerId?: string): Promise<Server[]> {
    const listed = await this.#list<CalagopusServer>(
      "/api/admin/servers",
      "servers",
    );
    const raw = ownerId
      ? listed.filter((server) => server.owner?.uuid === ownerId)
      : listed;

    const usages = await this.#mapLimit(raw, 6, async (server) => {
      if (server.status) return null;
      return this.getResources(server.uuid).catch(() => null);
    });

    return raw.map((server, index) =>
      this.#toServer(server, usages[index] ?? null),
    );
  }

  async getServer(id: string): Promise<Server> {
    const [response, usage] = await Promise.all([
      this.request<{ server: CalagopusServer }>(`/api/client/servers/${id}`),
      this.getResources(id).catch(() => null),
    ]);

    return this.#toServer(response.server, usage);
  }

 override async getServerOwner(id: string): Promise<string | null> {
    return this.#cached(`owner:${id}`, 15_000, async () => {
      const response = await this.request<{ server: CalagopusServer }>(
        `/api/admin/servers/${id}`,
      );
      return response.server.owner?.uuid ?? null;
    });
  }

  override async updateNode(id: string, input: UpdateNode): Promise<Node> {
    const body: Record<string, unknown> = {};

    if (input.deploymentEnabled !== undefined) {
      body.deployment_enabled = input.deploymentEnabled;
    }

    if (input.maintenanceEnabled !== undefined) {
      body.maintenance_enabled = input.maintenanceEnabled;
    }

    if (input.memory !== undefined) {
      body.memory = input.memory;
    }

    if (input.disk !== undefined) {
      body.disk = input.disk;
    }

    if (input.allocations !== undefined) {
      body.feature_limits = {
        ...(await this.#cached(
          `node:${id}:limits`,
          Calagopus.METADATA_TTL,
          async () => {
            const servers = await this.#list<CalagopusServer>(
              "/api/admin/servers",
              "servers",
            );
            const server = servers.find((entry) => entry.node === id);
            return server?.feature_limits ?? {};
          },
        )),
        allocations: input.allocations,
      };
    }

    await this.#jsonRequest(`/api/admin/nodes/${id}`, "PATCH", body);

    const nodes = await this.getNodes();
    const node = nodes.find((entry) => entry.id === id);

    if (!node) {
      throw new AdapterError(`Node ${id} was not found`, "NOT_FOUND");
    }

    return node;
  }

  override async getNodes(): Promise<Node[]> {
    return this.#cached("nodes:detailed", Calagopus.METADATA_TTL, async () => {
      const [nodes, capacities] = await Promise.all([
        this.#list<CalagopusNode>("/api/admin/nodes", "nodes"),
        this.request<{ allocated: Record<string, CalagopusCapacity> }>(
          "/api/admin/nodes/capacities",
        ).catch((): { allocated: Record<string, CalagopusCapacity> } => ({
          allocated: {},
        })),
      ]);

      return Promise.all(
        nodes.map(async (node) => {
          const allocated = capacities.allocated[node.uuid];
          const memoryLimit = node.memory ?? 0;
          const diskLimit = node.disk ?? 0;
          const memoryAllocated =
            (allocated?.memory ?? 0) + (allocated?.memory_overhead ?? 0);
          const diskAllocated = allocated?.disk ?? 0;

          let allocations: number;
          try {
            allocations = (
              await this.#list<CalagopusAllocation>(
                `/api/admin/nodes/${node.uuid}/allocations/available`,
                "allocations",
              )
            ).length;
          } catch {
            allocations = -1;
          }

          const memoryFull = memoryLimit > 0 && memoryAllocated >= memoryLimit;
          const diskFull = diskLimit > 0 && diskAllocated >= diskLimit;
          const reason =
            node.maintenance_enabled === true
              ? "Node is in maintenance"
              : node.deployment_enabled === false
                ? "Deployment is disabled"
                : memoryFull
                  ? "Memory is full"
                  : diskFull
                    ? "Disk is full"
                    : allocations === 0
                      ? "No free allocations"
                      : undefined;

          return {
            id: node.uuid,
            name: node.name,
            memory: { allocated: memoryAllocated, limit: memoryLimit },
            disk: { allocated: diskAllocated, limit: diskLimit },
            servers: allocated?.servers ?? 0,
            allocations,
            available: reason === undefined,
            reason,
            deploymentEnabled: node.deployment_enabled !== false,
            maintenanceEnabled: node.maintenance_enabled === true,
          };
        }),
      );
    });
  }

  #nests(): Promise<CalagopusNest[]> {
    return this.#cached("nests", Calagopus.METADATA_TTL, () =>
      this.#list<CalagopusNest>("/api/admin/nests", "nests"),
    );
  }

  #eggs(): Promise<
    Array<{ nest: CalagopusNest; nestIndex: number; egg: CalagopusEgg }>
  > {
    return this.#cached("eggs", Calagopus.METADATA_TTL, async () => {
      const nests = await this.#nests();
      const lists = await Promise.all(
        nests.map((nest) =>
          this.#list<CalagopusEgg>(
            `/api/admin/nests/${nest.uuid}/eggs`,
            "eggs",
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

  override async getSoftwareVariables(
    softwareGroup: number,
    software: number,
  ): Promise<SoftwareVariable[]> {
    const { nest, egg } = await this.#deployEgg(software, softwareGroup);

    return this.#cached(
      `variables:${egg.uuid}`,
      Calagopus.METADATA_TTL,
      async () => {
        const response = await this.request<{
          variables: CalagopusVariable[] | { data: CalagopusVariable[] };
        }>(`/api/admin/nests/${nest.uuid}/eggs/${egg.uuid}/variables`);

        const variables = Array.isArray(response.variables)
          ? response.variables
          : response.variables.data;

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

  async #deployEgg(
    software: number,
    softwareGroup: number,
  ): Promise<{ nest: CalagopusNest; egg: CalagopusEgg }> {
    const eggs = await this.#eggs();
    const chosen = eggs[software];

    if (!chosen) {
      throw new AdapterError(
        `Unknown software: ${software}`,
        "VALIDATION",
        undefined,
      );
    }

    const groupIndex = chosen.nestIndex;

    if (groupIndex !== softwareGroup) {
      throw new AdapterError(
        `Software ${software} does not belong to group ${softwareGroup}`,
        "VALIDATION",
      );
    }

    return chosen;
  }

  async #nodeForDeployment(nodeRef?: string): Promise<{ node: Node }> {
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

      return { node: selected };
    }

    const node = nodes.find((candidate) => candidate.available);

    if (!node) {
      throw new AdapterError("No nodes available", "NOT_FOUND");
    }

    return { node };
  }

  async #allocationForNode(nodeUuid: string): Promise<CalagopusAllocation> {
    const allocations = await this.#list<CalagopusAllocation>(
      `/api/admin/nodes/${nodeUuid}/allocations/available`,
      "allocations",
    );

    if (allocations.length === 0) {
      throw new AdapterError("No available allocations", "NOT_FOUND");
    }

    const allocation = allocations[0];
    if (!allocation) {
      throw new AdapterError("No available allocations", "NOT_FOUND");
    }

    return allocation;
  }

  async createServer(input: CreateServer): Promise<Server> {
    if (input.software === undefined || input.softwareGroup === undefined) {
      throw new AdapterError(
        "An egg (software) and nest (softwareGroup) are required to create a server",
        "VALIDATION",
      );
    }

    const [target, { node }, owner] = await Promise.all([
      this.#deployEgg(input.software, input.softwareGroup),
      this.#nodeForDeployment(input.node),
      input.ownerId
        ? Promise.resolve({ id: input.ownerId })
        : this.getCurrentUser(),
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
    const [allocation, variables] = await Promise.all([
      this.#allocationForNode(node.id),
      this.getSoftwareVariables(input.software, input.softwareGroup).catch(
        () => [] as SoftwareVariable[],
      ),
    ]);
    const variableValues = new Map(
      variables.map((variable) => [
        variable.key,
        input.variables?.[variable.key] ?? variable.defaultValue,
      ]),
    );

    for (const [key, value] of Object.entries(input.variables ?? {})) {
      variableValues.set(key, value);
    }

    const response = await this.#jsonRequest("/api/admin/servers", "POST", {
      node_uuid: node.id,
      owner_uuid: owner.id,
      egg_uuid: target.egg.uuid,
      allocation_uuids: [allocation.uuid],
      start_on_completion: true,
      skip_installer: false,
      name: input.name,
      description: input.description ?? null,
      pinned_cpus: [],
      startup:
        input.startup ||
        Object.values(target.egg.startup_commands ?? {})[0] ||
        "",
      image:
        input.image || Object.values(target.egg.docker_images ?? {})[0] || "",
      hugepages_passthrough_enabled: false,
      kvm_passthrough_enabled: false,
      limits: {
        cpu: input.cpu ?? DEFAULT_SERVER_LIMITS.cpu,
        memory: ram,
        memory_overhead: 0,
        swap: -1,
        disk,
      },
      feature_limits: {
        allocations: 1 + Math.max(0, Math.floor(input.allocations ?? 0)),
        databases:
          input.databases === undefined ? 1 : Math.max(0, Math.floor(input.databases)),
        backups: 2,
        schedules: 1,
      },
      variables: [...variableValues].map(([key, value]) => ({
        env_variable: key,
        value,
      })),
    });

    const created = (await response.json()) as { server: CalagopusServer };
    return this.#toServer(created.server, null);
  }

  override async updateServer(
    id: string,
    input: UpdateServer,
  ): Promise<Server> {
    const current = await this.request<{ server: CalagopusServer }>(
      `/api/admin/servers/${id}`,
    );
    const limits = current.server.limits;

    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (
      input.ram !== undefined ||
      input.disk !== undefined ||
      input.cpu !== undefined
    ) {
      body.limits = {
        cpu: input.cpu ?? limits.cpu,
        memory: input.ram ?? limits.memory,
        memory_overhead: limits.memory_overhead ?? 0,
        swap: limits.swap,
        disk: input.disk ?? limits.disk,
        io_weight: limits.io_weight ?? null,
      };
    }

    const featureLimits = current.server.feature_limits;
    if (input.databases !== undefined || input.allocations !== undefined) {
      body.feature_limits = {
        ...featureLimits,
        databases: input.databases ?? featureLimits?.databases ?? 0,
        allocations: input.allocations ?? featureLimits?.allocations ?? 1,
      };
    }

    await this.#jsonRequest(`/api/admin/servers/${id}`, "PATCH", body);

    return this.#toServer(
      {
        ...current.server,
        name: input.name ?? current.server.name,
        description: input.description ?? current.server.description,
        limits: (body.limits as CalagopusServerLimits) ?? limits,
        feature_limits:
          (body.feature_limits as CalagopusServerFeatureLimits) ?? featureLimits,
      },
      null,
    );
  }

  override async deleteServer(id: string): Promise<void> {
    await this.#jsonRequest(`/api/admin/servers/${id}`, "DELETE", {
      force: false,
      delete_backups: true,
    });
  }

  async #power(id: string, action: string): Promise<void> {
    await this.#jsonRequest(`/api/client/servers/${id}/power`, "POST", {
      action,
    });
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
    await this.#jsonRequest(
      `/api/client/servers/${id}/settings/reinstall`,
      "POST",
      {},
    );
  }

  override async sendCommand(id: string, command: string): Promise<void> {
    await this.#jsonRequest(`/api/client/servers/${id}/command`, "POST", {
      command,
    });
  }

  override async getResources(id: string): Promise<ResourceUsage> {
    const response = await this.request<{ resources: CalagopusResources }>(
      `/api/client/servers/${id}/resources`,
    );
    const resources = response.resources;

    return {
      ram: Math.round(resources.memory_bytes / MEGABYTE),
      disk: Math.round(resources.disk_bytes / MEGABYTE),
      cpu: Math.round(resources.cpu_absolute),
      uptime: resources.uptime,
      state: STATUS_MAP[resources.state] ?? "unknown",
    };
  }

  override async getPanelPrompts(
    scope: PanelScope,
    serverId?: string,
    context?: { output?: string },
  ): Promise<PanelPrompt[]> {
    if (scope !== "server" || !serverId) return [];

    const output = context?.output;
    const mentionsEula = output
      ? /you need to agree to the eula|go to eula\.txt|agree to the eula/i.test(output)
      : false;

    // Live output is checked line by line, so avoid a file read for every
    // unrelated console line.
    if (output && !mentionsEula) return [];

    let content: string | null = null;

    try {
      content = await this.readFile(serverId, "/eula.txt");
    } catch {
      content = null;
    }

    if (content !== null && /eula\s*=\s*true/i.test(content)) return [];

    // Without live output this is a page-load check. Only prompt when an
    // unaccepted eula.txt exists, which catches servers that stopped for the
    // EULA before the console was ever opened.
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

  override async getWebsocket(id: string): Promise<WebsocketCredentials> {
    return this.request<WebsocketCredentials>(
      `/api/client/servers/${id}/websocket`,
    );
  }

  override async getConsole(id: string): Promise<ConsoleLine[]> {
    const text = await this.#requestText(
      `/api/client/servers/${id}/logs?lines=200`,
    );

    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const clean = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
        const match = clean.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/);
        const body = match?.[2] ?? clean;
        const level: ConsoleLine["level"] = /\/ERROR\]|ERROR/.test(body)
          ? "ERROR"
          : /\/WARN\]|WARN/.test(body)
            ? "WARN"
            : "INFO";

        return {
          time: match?.[1] ?? "",
          level,
          text: body,
        };
      });
  }

  #panelPath(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    if (normalized === FILES_ROOT) return "/";
    if (normalized.startsWith(`${FILES_ROOT}/`)) {
      return normalized.slice(FILES_ROOT.length);
    }
    return normalized;
  }

  override async listFiles(
    id: string,
    directory: string,
  ): Promise<FileEntry[]> {
    const response = await this.request<{
      entries: Paginated<CalagopusFileEntry>;
    }>(
      `/api/client/servers/${id}/files/list?directory=${encodeURIComponent(this.#panelPath(directory))}&sort=name_asc`,
    );

    const entries = response.entries.data ?? [];

    return entries.map((entry) => {
      const archive = /\.(tar\.gz|zip|gz|tgz|rar|7z)$/i.test(entry.name);

      return {
        name: entry.name,
        type: entry.directory ? "dir" : "file",
        size: entry.directory ? null : entry.size,
        modified: entry.modified,
        actions: entry.directory
          ? ["open", "copy", "compress", "delete"]
          : archive
            ? ["decompress", "download", "copy", "delete"]
            : ["edit", "download", "copy", "compress", "delete"],
      };
    });
  }

  override async getFileSystem(
    id: string,
  ): Promise<{ tree: Record<string, FileEntry[]> }> {
    const entries = await this.listFiles(id, FILES_ROOT);
    return { tree: { [FILES_ROOT]: entries } };
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
    await this.#jsonRequest(
      `/api/client/servers/${id}/files/create-directory`,
      "POST",
      { root: this.#panelPath(directory), name },
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
    const groups = new Map<string, string[]>();

    for (const path of paths) {
      const root = this.#parent(path);
      const files = groups.get(root) ?? [];
      files.push(this.#basename(path));
      groups.set(root, files);
    }

    await Promise.all(
      [...groups].map(([root, files]) =>
        this.#jsonRequest(`/api/client/servers/${id}/files/delete`, "POST", {
          root: this.#panelPath(root),
          files,
        }),
      ),
    );
  }

  override async renameFile(
    id: string,
    from: string,
    to: string,
  ): Promise<void> {
    await this.#jsonRequest(`/api/client/servers/${id}/files/rename`, "POST", {
      root: this.#panelPath(this.#parent(from)),
      files: [{ from: this.#basename(from), to: this.#basename(to) }],
    });
  }

  override async copyFile(id: string, from: string, to: string): Promise<void> {
    await this.#jsonRequest(`/api/client/servers/${id}/files/copy`, "POST", {
      location: this.#panelPath(this.#parent(to)),
      files: [this.#basename(from)],
    });
  }

  override async compressFiles(
    id: string,
    paths: string[],
    _name: string,
  ): Promise<FileEntry> {
    const response = (await (
      await this.#jsonRequest(
        `/api/client/servers/${id}/files/compress`,
        "POST",
        {
          root: this.#panelPath(this.#parent(paths[0] ?? FILES_ROOT)),
          files: paths.map((path) => this.#basename(path)),
        },
      )
    ).json()) as { file?: { name: string; size: number } };

    const file = response.file;
    return {
      name: file?.name ?? `${this.#basename(paths[0] ?? "archive")}.tar.gz`,
      type: "file",
      size: file?.size ?? null,
      modified: new Date().toISOString(),
      actions: ["decompress", "download", "delete"],
    };
  }

  override async decompressFile(id: string, path: string): Promise<void> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/files/decompress`,
      "POST",
      { root: this.#panelPath(this.#parent(path)), file: this.#basename(path) },
    );
  }

  override async getFileDownloadUrl(
    id: string,
    path: string,
  ): Promise<string | null> {
    const response = await this.request<{
      attributes?: { url?: string };
      url?: string;
    }>(
      `/api/client/servers/${id}/files/download?file=${encodeURIComponent(this.#panelPath(path))}`,
    );

    return response.attributes?.url ?? response.url ?? null;
  }

  #parent(path: string): string {
    const trimmed = path.replace(/\/+$/, "");
    const index = trimmed.lastIndexOf("/");
    return index <= 0 ? "/" : trimmed.slice(0, index);
  }

  #basename(path: string): string {
    return path.replace(/\/+$/, "").split("/").pop() ?? path;
  }

  override async readFile(id: string, path: string): Promise<string> {
    return this.#requestText(
      `/api/client/servers/${id}/files/contents?file=${encodeURIComponent(this.#panelPath(path))}`,
    );
  }

  override async writeFile(
    id: string,
    path: string,
    content: string,
  ): Promise<void> {
    await this.#requestText(
      `/api/client/servers/${id}/files/write?file=${encodeURIComponent(this.#panelPath(path))}`,
      {
        method: "POST",
        body: content,
        headers: { "Content-Type": "text/plain" },
      },
    );
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

    const path = `${directory.replace(/\/+$/, "")}/${filename}`;
    const target = new URL(
      `/api/client/servers/${id}/files/write?file=${encodeURIComponent(this.#panelPath(path))}`,
      this.url,
    );

    let write: Response;
    try {
      write = await fetchWithTimeout(
        target,
        {
          method: "POST",
          body,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/octet-stream",
          },
        },
        120_000,
      );
    } catch {
      throw new AdapterError(
        "Unable to write the addon to the server",
        "NETWORK",
      );
    }

    if (!write.ok) {
      throw new AdapterError(
        `The panel rejected the addon upload (${write.status})`,
        errorForStatus(write.status),
        write.status,
      );
    }

    return {
      name: filename,
      type: "file",
      size: body.byteLength,
      modified: new Date().toISOString(),
      actions: ["edit", "download", "delete"],
    };
  }

  override async listBackups(id: string): Promise<Backup[]> {
    const raw = await this.#list<CalagopusBackup>(
      `/api/client/servers/${id}/backups`,
      "backups",
    );

    return raw.map((backup) => ({
      id: backup.uuid,
      name: backup.name,
      size: backup.bytes,
      createdAt: backup.completed ?? new Date(0).toISOString(),
      status: backup.is_successful
        ? "completed"
        : backup.completed
          ? "failed"
          : "running",
      actions: ["download", "restore", "delete"],
    }));
  }

  override async createBackup(
    id: string,
    input?: CreateBackup,
  ): Promise<Backup> {
    const response = (await (
      await this.#jsonRequest(`/api/client/servers/${id}/backups`, "POST", {
        name: input?.name ?? null,
        ignored_files: [],
      })
    ).json()) as { backup: CalagopusBackup };

    const backup = response.backup;
    return {
      id: backup.uuid,
      name: backup.name,
      size: backup.bytes,
      createdAt: backup.completed ?? new Date().toISOString(),
      status: backup.is_successful
        ? "completed"
        : backup.completed
          ? "failed"
          : "running",
      actions: ["download", "restore", "delete"],
    };
  }

  override async deleteBackup(id: string, backupId: string): Promise<void> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/backups/${backupId}`,
      "DELETE",
      undefined,
    );
  }

  override async restoreBackup(id: string, backupId: string): Promise<void> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/backups/${backupId}/restore`,
      "POST",
      { truncate: false },
    );
  }

  override async getBackupDownloadUrl(
    id: string,
    backupId: string,
  ): Promise<string | null> {
    const response = await this.request<{
      attributes?: { url?: string };
      url?: string;
    }>(`/api/client/servers/${id}/backups/${backupId}/download`);

    return response.attributes?.url ?? response.url ?? null;
  }

  override async listDatabases(id: string): Promise<Database[]> {
    const raw = await this.#list<CalagopusDatabase>(
      `/api/client/servers/${id}/databases`,
      "databases",
    );

    return raw.map((database) => ({
      id: database.uuid,
      name: database.name,
      username: database.username,
      host: database.host,
      port: database.port,
      actions: ["delete"],
    }));
  }

  override async createDatabase(
    id: string,
    input: CreateDatabase,
  ): Promise<Database> {
    const hosts = await this.request<{
      database_hosts: CalagopusDatabaseHost[];
    }>(`/api/client/servers/${id}/databases/hosts`);

    const host = hosts.database_hosts[0];
    if (!host) {
      throw new AdapterError("No database hosts available", "NOT_FOUND");
    }

    const response = (await (
      await this.#jsonRequest(`/api/client/servers/${id}/databases`, "POST", {
        database_host_uuid: host.uuid,
        name: input.name,
      })
    ).json()) as { database: CalagopusDatabase };

    const database = response.database;
    return {
      id: database.uuid,
      name: database.name,
      username: database.username,
      host: database.host,
      port: database.port,
      actions: ["delete"],
    };
  }

  override async deleteDatabase(id: string, databaseId: string): Promise<void> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/databases/${databaseId}`,
      "DELETE",
      undefined,
    );
  }

  #toAllocation(allocation: CalagopusAllocation): Allocation {
    const primary =
      allocation.is_primary === true || allocation.is_default === true;

    return {
      id: allocation.uuid,
      ip: allocation.ip,
      port: allocation.port,
      primary,
      notes: allocation.notes ?? null,
      actions: primary ? [] : ["primary", "delete"],
    };
  }

  override async listAllocations(id: string): Promise<Allocation[]> {
    return this.#cached(`allocations:${id}`, 10_000, async () => {
      const response = await this.request<{
        allocations: Paginated<CalagopusAllocation>;
      }>(`/api/client/servers/${id}/allocations`);

      return (response.allocations.data ?? []).map((allocation) =>
        this.#toAllocation(allocation),
      );
    });
  }

  override async createAllocation(id: string): Promise<Allocation> {
    const response = (await (
      await this.#jsonRequest(
        `/api/client/servers/${id}/allocations`,
        "POST",
        {},
      )
    ).json()) as { allocation: CalagopusAllocation };

    this.#cache.delete(`allocations:${id}`);
    return this.#toAllocation(response.allocation);
  }

  override async deleteAllocation(
    id: string,
    allocationId: string,
  ): Promise<void> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/allocations/${allocationId}`,
      "DELETE",
      undefined,
    );
    this.#cache.delete(`allocations:${id}`);
  }

  override async setPrimaryAllocation(
    id: string,
    allocationId: string,
  ): Promise<Allocation[]> {
    await this.#jsonRequest(
      `/api/client/servers/${id}/allocations/${allocationId}`,
      "PATCH",
      { primary: true },
    );
    this.#cache.delete(`allocations:${id}`);
    return this.listAllocations(id);
  }
}
