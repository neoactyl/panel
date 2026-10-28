import { FetchTimeoutError, fetchWithTimeout } from '#lib/http.ts';

export const ADAPTER_CONTRACT_VERSION = 1;

export type AdapterCapabilities = {
  servers: {
    list: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    suspend: boolean;
    power: boolean;
  };
  console: {
    commands: boolean;
    history: boolean;
    websocket: boolean;
  };
  files: {
    read: boolean;
    write: boolean;
    upload: boolean;
    manage: boolean;
  };
  allocations: boolean;
  backups: boolean;
  databases: boolean;
  schedules: boolean;
  startup: boolean;
  subusers: boolean;
  activities: boolean;
  resources: boolean;
  accounts: {
    link: boolean;
    create: boolean;
  };
  nodes: {
    list: boolean;
    update: boolean;
  };
};

export const DEFAULT_SERVER_LIMITS = {
  cpu: 100,
  memory: 2048,
  disk: 10240,
} as const;

export type CreateServer = {
  name: string;
  description?: string;
  node?: string;
  ram?: number;
  disk?: number;
  cpu?: number;
  databases?: number;
  allocations?: number;
  softwareGroup?: number;
  software?: number;
  variables?: Record<string, string>;
  image?: string;
  startup?: string;
  ownerId?: string;
};

export type Node = {
  id: string;
  name: string;
  memory: { allocated: number; limit: number };
  disk: { allocated: number; limit: number };
  servers: number;
  allocations: number;
  available: boolean;
  reason?: string;
  deploymentEnabled?: boolean;
  maintenanceEnabled?: boolean;
};

export type UpdateServer = {
  name?: string;
  description?: string;
  ram?: number;
  disk?: number;
  cpu?: number;
  databases?: number;
  allocations?: number;
};

export type UpdateNode = {
  deploymentEnabled?: boolean;
  maintenanceEnabled?: boolean;
  memory?: number;
  disk?: number;
  allocations?: number;
};

export type ServerStatus =
  | "running"
  | "starting"
  | "stopping"
  | "offline"
  | "installing"
  | "suspended"
  | "unknown";

export type ServerState = ServerStatus;

export type ServerAction = "start" | "stop" | "restart" | "kill";

export type ResourceLimits = {
  ram: number;
  disk: number;
  cpu: number;
};

export type ResourceUsage = {
  ram: number;
  disk: number;
  cpu: number;
  uptime: number;
  state?: ServerStatus;
};

export type WebsocketCredentials = {
  url: string;
  token: string;
};

export type Server = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  node: string;
  image: string;
  version: string;
  state: ServerStatus;
  cpu: { used: number; limit: number };
  memory: { used: number; limit: number };
  disk: { used: number; limit: number };
  databaseLimit?: number;
  allocationLimit?: number;
  actions: ServerAction[];
  ownerId?: string;
};

export type User = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
};

export type SoftwareGroup = {
  id: number;
  name: string;
  description: string | null;
};

export type Software = {
  id: number;
  groupId: number;
  name: string;
  description: string | null;
  versions: SoftwareVersion[];
};

export type SoftwareVersion = {
  id: string;
  name: string;
  latest: boolean;
};

export type SoftwareVariable = {
  key: string;
  name: string;
  description: string;
  defaultValue: string;
  editable: boolean;
};

export type ConsoleLine = {
  time: string;
  level: "INFO" | "WARN" | "ERROR" | "OUT";
  text: string;
};

export type PanelScope = "app" | "server";

export type PanelField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  placeholder?: string;
  value?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  help?: string;
};

export type PanelStat = {
  label: string;
  value: string;
  detail?: string;
};

export type PanelButton = {
  actionId: string;
  label: string;
  kind?: "primary" | "secondary" | "danger";
};

export type PanelBlock =
  | { type: "text"; title?: string; body: string }
  | {
      type: "alert";
      tone: "info" | "success" | "warning" | "error";
      title?: string;
      body: string;
    }
  | { type: "stats"; items: PanelStat[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "actions"; actions: PanelButton[] }
  | {
      type: "form";
      actionId: string;
      submitLabel?: string;
      fields: PanelField[];
    };

export type PanelPage = {
  id: string;
  path: string;
  label: string;
  title?: string;
  description?: string;
  navGroup?: string;
  icon?: string;
  order?: number;
  hidden?: boolean;
  blocks: PanelBlock[];
};

export type PanelBlueprint = {
  pages: PanelPage[];
};

export type PanelActionRequest = {
  scope: PanelScope;
  serverId?: string;
  pageId?: string;
  promptId?: string;
  actionId: string;
  values?: Record<string, string | number | boolean | null>;
};

export type PanelPrompt = {
  id: string;
  scope: PanelScope;
  serverId?: string;
  title: string;
  message: string;
  tone?: "info" | "warning" | "danger";
  link?: { label: string; href: string };
  confirmLabel?: string;
  cancelLabel?: string;
  actionId?: string;
  href?: string;
  external?: boolean;
  dismissible?: boolean;
};

export type PanelActionResult = {
  prompt?: PanelPrompt;
  prompts?: PanelPrompt[];
  redirect?: string;
  external?: boolean;
  message?: string;
  refresh?: boolean;
};

export type ConsoleEvent =
  | { type: "output"; data: string }
  | { type: "status"; status: ServerStatus }
  | { type: "stats"; usage: ResourceUsage }
  | { type: "prompt"; prompts: PanelPrompt[] }
  | { type: "error"; message: string };

export type FileAction =
  | "open"
  | "edit"
  | "download"
  | "copy"
  | "compress"
  | "decompress"
  | "delete";

export type FileEntry = {
  name: string;
  type: "file" | "dir";
  size: number | null;
  modified: string;
  content?: string;
  actions?: FileAction[];
};

export type FileSystem = {
  tree: Record<string, FileEntry[]>;
};

export type Allocation = {
  id: string;
  ip: string;
  port: number;
  primary: boolean;
  notes: string | null;
  actions?: ("primary" | "delete")[];
};

export type CreateBackup = {
  name?: string;
};

export type Backup = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  status: "completed" | "running" | "failed";
  actions?: ("download" | "restore" | "delete")[];
};

export type CreateDatabase = {
  name: string;
  connectionsLimit?: number;
};

export type Database = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  actions?: ("delete")[];
};

export type ScheduleAction =
  | "restart"
  | "stop"
  | "start"
  | "save-all"
  | "backup run"
  | (string & {});

export type CreateSchedule = {
  name: string;
  cron: string;
  action: ScheduleAction;
  enabled?: boolean;
};

export type UpdateSchedule = {
  name?: string;
  cron?: string;
  action?: ScheduleAction;
  enabled?: boolean;
};

export type Schedule = {
  id: string;
  name: string;
  cron: string;
  action: ScheduleAction;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string;
  actions?: ("toggle" | "delete")[];
};

export type StartupVariable = {
  key: string;
  name: string;
  description: string;
  value: string;
  editable: boolean;
};

export type Startup = {
  image: string;
  command: string;
  variables: StartupVariable[];
};

export type UpdateStartup = {
  variables: Array<{ key: string; value: string }>;
};

export type Subuser = {
  id: string;
  username: string;
  email: string;
  permissions: string[];
  addedAt: string;
  actions?: ("update" | "delete")[];
};

export type CreateSubuser = {
  email: string;
  permissions?: string[];
};

export type UpdateSubuser = {
  permissions: string[];
};

export type Activity = {
  id: string;
  actor: string;
  event: string;
  detail: string;
  ip: string;
  timestamp: string;
};

export type PanelErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UNSUPPORTED"
  | "NETWORK"
  | "UNKNOWN";

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: PanelErrorCode = "UNKNOWN",
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export const FILES_ROOT = "/home/container";

export abstract class Adapter {
  readonly url: URL;
  readonly contractVersion = ADAPTER_CONTRACT_VERSION;
  #token: string;

  abstract readonly capabilities: AdapterCapabilities;

  protected get token(): string {
    return this.#token;
  }

  constructor(url: string, token: string) {
    this.url = new URL(url);
    this.#token = token;
  }

  protected async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const endpoint = new URL(path, this.url);
    let response: Response;

    try {
      response = await fetchWithTimeout(endpoint, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.#token}`,
        },
      });
    } catch (cause) {
      if (cause instanceof FetchTimeoutError) {
        throw new AdapterError(cause.message, "NETWORK");
      }

      throw new AdapterError("The panel could not be reached.", "NETWORK");
    }

    if (!response.ok) {
      const code: PanelErrorCode =
        response.status === 401 || response.status === 403
          ? "UNAUTHORIZED"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 400 || response.status === 422
              ? "VALIDATION"
              : response.status === 429
                ? "RATE_LIMITED"
                : "UNKNOWN";

      throw new AdapterError(
        `Adapter request failed: ${response.status} ${response.statusText}`,
        code,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  protected unsupported(method: string): never {
    throw new AdapterError(
      `${method} is not supported by this adapter`,
      "UNSUPPORTED",
    );
  }

  abstract connect(): Promise<boolean>;
  abstract getServers(): Promise<Server[]>;
  abstract getServer(id: string): Promise<Server>;
  abstract createServer(input: CreateServer): Promise<Server>;
  abstract listSoftwares(): Promise<Software[]>;
  abstract listSoftwareGroups(): Promise<SoftwareGroup[]>;

  async getSoftwareVariables(
    _softwareGroup: number,
    _software: number,
  ): Promise<SoftwareVariable[]> {
    return [];
  }

  async getNodes(): Promise<Node[]> {
    return [];
  }

  refreshCatalog(): void {}

  async getPanelBlueprint(
    _scope: PanelScope,
    _serverId?: string,
  ): Promise<PanelBlueprint> {
    return { pages: [] };
  }

  async getPanelPrompts(
    _scope: PanelScope,
    _serverId?: string,
    _context?: { output?: string },
  ): Promise<PanelPrompt[]> {
    return [];
  }

  async runPanelAction(
    _request: PanelActionRequest,
  ): Promise<PanelActionResult> {
    this.unsupported("runPanelAction");
  }

  async getCurrentUser(): Promise<User> {
    this.unsupported("getCurrentUser");
  }

  async getServerOwner(_id: string): Promise<string | null> {
    return null;
  }

  async updateServer(_id: string, _input: UpdateServer): Promise<Server> {
    this.unsupported("updateServer");
  }

  async updateNode(_id: string, _input: UpdateNode): Promise<Node> {
    this.unsupported("updateNode");
  }

  async deleteServer(_id: string): Promise<void> {
    this.unsupported("deleteServer");
  }

  async suspendServer(_id: string): Promise<void> {
    this.unsupported("suspendServer");
  }

  async unsuspendServer(_id: string): Promise<void> {
    this.unsupported("unsuspendServer");
  }

  async startServer(_id: string): Promise<void> {
    this.unsupported("startServer");
  }

  async stopServer(_id: string): Promise<void> {
    this.unsupported("stopServer");
  }

  async restartServer(_id: string): Promise<void> {
    this.unsupported("restartServer");
  }

  async killServer(_id: string): Promise<void> {
    this.unsupported("killServer");
  }

  async reinstallServer(_id: string): Promise<void> {
    this.unsupported("reinstallServer");
  }

  async sendCommand(_id: string, _command: string): Promise<void> {
    this.unsupported("sendCommand");
  }

  async getConsole(_id: string): Promise<ConsoleLine[]> {
    this.unsupported("getConsole");
  }

  async getResources(_id: string): Promise<ResourceUsage> {
    this.unsupported("getResources");
  }

  async getWebsocket(_id: string): Promise<WebsocketCredentials> {
    this.unsupported("getWebsocket");
  }

  async listAllocations(_id: string): Promise<Allocation[]> {
    this.unsupported("listAllocations");
  }

  async createAllocation(_id: string): Promise<Allocation> {
    this.unsupported("createAllocation");
  }

  async deleteAllocation(_id: string, _allocationId: string): Promise<void> {
    this.unsupported("deleteAllocation");
  }

  async setPrimaryAllocation(
    _id: string,
    _allocationId: string,
  ): Promise<Allocation[]> {
    this.unsupported("setPrimaryAllocation");
  }

  async listBackups(_id: string): Promise<Backup[]> {
    this.unsupported("listBackups");
  }

  async createBackup(_id: string, _input?: CreateBackup): Promise<Backup> {
    this.unsupported("createBackup");
  }

  async deleteBackup(_id: string, _backupId: string): Promise<void> {
    this.unsupported("deleteBackup");
  }

  async restoreBackup(_id: string, _backupId: string): Promise<void> {
    this.unsupported("restoreBackup");
  }

  async getBackupDownloadUrl(_id: string, _backupId: string): Promise<string | null> {
    return null;
  }

  async getFileDownloadUrl(_id: string, _path: string): Promise<string | null> {
    return null;
  }

  async listDatabases(_id: string): Promise<Database[]> {
    this.unsupported("listDatabases");
  }

  async createDatabase(
    _id: string,
    _input: CreateDatabase,
  ): Promise<Database> {
    this.unsupported("createDatabase");
  }

  async deleteDatabase(_id: string, _databaseId: string): Promise<void> {
    this.unsupported("deleteDatabase");
  }

  async listSchedules(_id: string): Promise<Schedule[]> {
    this.unsupported("listSchedules");
  }

  async createSchedule(_id: string, _input: CreateSchedule): Promise<Schedule> {
    this.unsupported("createSchedule");
  }

  async updateSchedule(
    _id: string,
    _scheduleId: string,
    _input: UpdateSchedule,
  ): Promise<Schedule> {
    this.unsupported("updateSchedule");
  }

  async deleteSchedule(_id: string, _scheduleId: string): Promise<void> {
    this.unsupported("deleteSchedule");
  }

  async getStartup(_id: string): Promise<Startup> {
    this.unsupported("getStartup");
  }

  async updateStartup(_id: string, _input: UpdateStartup): Promise<Startup> {
    this.unsupported("updateStartup");
  }

  async listSubusers(_id: string): Promise<Subuser[]> {
    this.unsupported("listSubusers");
  }

  async createSubuser(_id: string, _input: CreateSubuser): Promise<Subuser> {
    this.unsupported("createSubuser");
  }

  async updateSubuser(
    _id: string,
    _subuserId: string,
    _input: UpdateSubuser,
  ): Promise<Subuser> {
    this.unsupported("updateSubuser");
  }

  async deleteSubuser(_id: string, _subuserId: string): Promise<void> {
    this.unsupported("deleteSubuser");
  }

  async listActivities(_id: string): Promise<Activity[]> {
    this.unsupported("listActivities");
  }

  async getFileSystem(_id: string): Promise<FileSystem> {
    this.unsupported("getFileSystem");
  }

  async listFiles(_id: string, _directory: string): Promise<FileEntry[]> {
    this.unsupported("listFiles");
  }

  async readFile(_id: string, _path: string): Promise<string> {
    this.unsupported("readFile");
  }

  async writeFile(_id: string, _path: string, _content: string): Promise<void> {
    this.unsupported("writeFile");
  }

  async createFile(
    _id: string,
    _directory: string,
    _name: string,
  ): Promise<FileEntry> {
    this.unsupported("createFile");
  }

  async createDirectory(
    _id: string,
    _directory: string,
    _name: string,
  ): Promise<FileEntry> {
    this.unsupported("createDirectory");
  }

  async deleteFiles(_id: string, _paths: string[]): Promise<void> {
    this.unsupported("deleteFiles");
  }

  async renameFile(_id: string, _from: string, _to: string): Promise<void> {
    this.unsupported("renameFile");
  }

  async copyFile(_id: string, _from: string, _to: string): Promise<void> {
    this.unsupported("copyFile");
  }

  async compressFiles(
    _id: string,
    _paths: string[],
    _name: string,
  ): Promise<FileEntry> {
    this.unsupported("compressFiles");
  }

  async decompressFile(_id: string, _path: string): Promise<void> {
    this.unsupported("decompressFile");
  }

  async uploadFiles(
    _id: string,
    _directory: string,
    _files: Array<{ name: string; size: number; content?: string }>,
  ): Promise<FileEntry[]> {
    this.unsupported("uploadFiles");
  }

  async downloadToServer(
    _id: string,
    _directory: string,
    _filename: string,
    _url: string,
  ): Promise<FileEntry> {
    this.unsupported("downloadToServer");
  }
}

const REQUIRED_METHODS = [
  "connect",
  "getServers",
  "getServer",
  "createServer",
  "listSoftwares",
  "listSoftwareGroups",
] as const;

const CAPABILITY_GROUPS = {
  servers: ["list", "create", "update", "delete", "suspend", "power"],
  console: ["commands", "history", "websocket"],
  files: ["read", "write", "upload", "manage"],
  accounts: ["link", "create"],
} as const;

const FLAG_CAPABILITIES = [
  "allocations",
  "backups",
  "databases",
  "schedules",
  "startup",
  "subusers",
  "activities",
  "resources",
] as const;

export const assertAdapterContract = (candidate: unknown): Adapter => {
  if (!(candidate instanceof Adapter)) {
    throw new Error("Panel adapter must extend the Adapter base class.");
  }

  if (candidate.contractVersion !== ADAPTER_CONTRACT_VERSION) {
    throw new Error(
      `Panel adapter contract v${candidate.contractVersion} is not supported (expected v${ADAPTER_CONTRACT_VERSION}).`,
    );
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof candidate[method] !== "function") {
      throw new Error(`Panel adapter is missing the required "${method}" method.`);
    }
  }

  for (const [group, keys] of Object.entries(CAPABILITY_GROUPS)) {
    const capabilities = candidate.capabilities?.[
      group as keyof typeof CAPABILITY_GROUPS
    ] as Record<string, unknown> | undefined;
    if (!capabilities || typeof capabilities !== "object") {
      throw new Error(`Panel adapter is missing the "${group}" capability group.`);
    }

    for (const key of keys) {
      if (typeof capabilities[key] !== "boolean") {
        throw new Error(
          `Panel adapter capability "${group}.${key}" must be a boolean.`,
        );
      }
    }
  }

  for (const capability of FLAG_CAPABILITIES) {
    if (typeof candidate.capabilities?.[capability] !== "boolean") {
      throw new Error(
        `Panel adapter capability "${capability}" must be a boolean.`,
      );
    }
  }

  return candidate;
};
