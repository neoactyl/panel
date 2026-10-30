import { Adapter, AdapterError, FILES_ROOT } from "#lib/adapter/sdk.ts";
import type {
  Activity,
  AdapterCapabilities,
  Allocation,
  Backup,
  ConsoleLine,
  CreateBackup,
  CreateDatabase,
  CreateSchedule,
  CreateServer,
  CreateSubuser,
  Database,
  FileEntry,
  FileSystem,
  Node,
  PanelActionRequest,
  PanelActionResult,
  PanelBlueprint,
  PanelScope,
  ResourceUsage,
  Schedule,
  Server,
  Software,
  SoftwareGroup,
  SoftwareVariable,
  Startup,
  Subuser,
  UpdateSchedule,
  UpdateServer,
  UpdateNode,
  UpdateStartup,
  UpdateSubuser,
  UploadFile,
  User,
} from "#lib/adapter/sdk.ts";
import { SAMPLE_SERVERS, NODES } from "./fixtures/servers.ts";
import {
  mockActivities,
  mockAllocations,
  mockBackups,
  mockConsole,
  mockDatabases,
  mockFileSystem,
  mockSchedules,
  mockStartupVariables,
  mockSubusers,
  STARTUP_COMMAND,
  timeNow,
} from "./fixtures/server-panel.ts";

const clone = <T>(value: T): T => structuredClone(value);

const now = () => new Date().toISOString();

const ARCHIVE = /\.(tar\.gz|zip|gz|tgz|rar|7z)$/i;

const fileActions = (entry: FileEntry): FileEntry => {
  if (entry.type === "dir") {
    return { ...entry, actions: ["open", "copy", "compress", "delete"] };
  }

  if (ARCHIVE.test(entry.name)) {
    return { ...entry, actions: ["decompress", "download", "copy", "delete"] };
  }

  return {
    ...entry,
    actions: ["edit", "download", "copy", "compress", "delete"],
  };
};

const splitPath = (path: string): { directory: string; name: string } => {
  const clean = path.replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  return {
    directory: index <= 0 ? FILES_ROOT : clean.slice(0, index),
    name: index <= 0 ? clean : clean.slice(index + 1),
  };
};

export class MockAdapter extends Adapter {
  readonly capabilities: AdapterCapabilities = {
    servers: {
      list: true,
      create: true,
      update: true,
      delete: true,
      suspend: true,
      power: true,
    },
    console: { commands: true, history: true, websocket: false },
    files: { read: true, write: true, upload: true, manage: true },
    allocations: true,
    backups: true,
    databases: true,
    schedules: true,
    startup: true,
    subusers: true,
    activities: true,
    resources: true,
    accounts: { link: false, create: false, delete: false },
    nodes: { list: true, update: true },
  };

  #servers: Server[] = clone(SAMPLE_SERVERS);
  #files = new Map<string, FileSystem>();
  #backups = new Map<string, Backup[]>();
  #databases = new Map<string, Database[]>();
  #schedules = new Map<string, Schedule[]>();
  #allocations = new Map<string, Allocation[]>();
  #subusers = new Map<string, Subuser[]>();
  #activities = new Map<string, Activity[]>();
  #startup = new Map<string, Startup>();
  #console = new Map<string, ConsoleLine[]>();

  constructor() {
    super("http://mock.local", "mock");
  }

  override async connect(): Promise<boolean> {
    return true;
  }

  #server(id: string): Server {
    const server = this.#servers.find((entry) => entry.id === id);
    if (!server) {
      throw new AdapterError(`Server ${id} was not found`, "NOT_FOUND");
    }
    return server;
  }

  #filesFor(id: string): FileSystem {
    this.#server(id);
    let system = this.#files.get(id);
    if (!system) {
      system = mockFileSystem();
      system.tree[FILES_ROOT] = (system.tree[FILES_ROOT] ?? []).map(
        fileActions,
      );
      this.#files.set(id, system);
    }
    return system;
  }

  #backupsFor(id: string): Backup[] {
    const server = this.#server(id);
    let backups = this.#backups.get(id);
    if (!backups) {
      backups = mockBackups(server).map((backup) => ({
        ...backup,
        actions: ["download", "restore", "delete"],
      }));
      this.#backups.set(id, backups);
    }
    return backups;
  }

  #databasesFor(id: string): Database[] {
    const server = this.#server(id);
    let databases = this.#databases.get(id);
    if (!databases) {
      databases = mockDatabases(server).map((database) => ({
        ...database,
        actions: ["delete"],
      }));
      this.#databases.set(id, databases);
    }
    return databases;
  }

  #schedulesFor(id: string): Schedule[] {
    this.#server(id);
    let schedules = this.#schedules.get(id);
    if (!schedules) {
      schedules = mockSchedules().map((schedule) => ({
        ...schedule,
        actions: ["toggle", "delete"],
      }));
      this.#schedules.set(id, schedules);
    }
    return schedules;
  }

  #allocationsFor(id: string): Allocation[] {
    const server = this.#server(id);
    let allocations = this.#allocations.get(id);
    if (!allocations) {
      allocations = mockAllocations(server).map((allocation) => ({
        ...allocation,
        actions: allocation.primary ? [] : ["primary", "delete"],
      }));
      this.#allocations.set(id, allocations);
    }
    return allocations;
  }

  #subusersFor(id: string): Subuser[] {
    this.#server(id);
    let subusers = this.#subusers.get(id);
    if (!subusers) {
      subusers = mockSubusers().map((subuser) => ({
        ...subuser,
        actions: ["update", "delete"],
      }));
      this.#subusers.set(id, subusers);
    }
    return subusers;
  }

  #activitiesFor(id: string): Activity[] {
    const server = this.#server(id);
    let activities = this.#activities.get(id);
    if (!activities) {
      activities = mockActivities(server);
      this.#activities.set(id, activities);
    }
    return activities;
  }

  #startupFor(id: string): Startup {
    const server = this.#server(id);
    let startup = this.#startup.get(id);
    if (!startup) {
      startup = {
        image: server.image,
        command: STARTUP_COMMAND,
        variables: mockStartupVariables(server),
      };
      this.#startup.set(id, startup);
    }
    return startup;
  }

  #consoleFor(id: string): ConsoleLine[] {
    const server = this.#server(id);
    let lines = this.#console.get(id);
    if (!lines) {
      lines = mockConsole(server);
      this.#console.set(id, lines);
    }
    return lines;
  }

  #log(id: string, actor: string, event: string, detail: string) {
    const activities = this.#activitiesFor(id);
    activities.unshift({
      id: crypto.randomUUID(),
      actor,
      event,
      detail,
      ip: "127.0.0.1",
      timestamp: now(),
    });
  }

  override async getCurrentUser(): Promise<User> {
    return {
      id: "mock-user",
      username: "samir",
      email: "samir@neoactyl.dev",
      isAdmin: true,
    };
  }

  override async getServers(): Promise<Server[]> {
    return clone(this.#servers);
  }

  override async getServer(id: string): Promise<Server> {
    return clone(this.#server(id));
  }

  /*async getPanelBlueprint(
    scope: PanelScope,
    serverId?: string,
  ): Promise<PanelBlueprint> {
    if (scope === "app") {
      return {
        pages: [
          {
            id: "blueprint-app",
            path: "blueprint",
            label: "Blueprint",
            title: "Blueprint extensions",
            description:
              "This page is declared by the adapter and rendered by the panel SDK.",
            icon: "puzzle",
            order: 50,
            blocks: [
              {
                type: "text",
                title: "Adapter-provided pages",
                body: "Pages can be added to the app or to a server without creating new SvelteKit routes. The adapter supplies the content, navigation metadata, and actions.",
              },
              {
                type: "stats",
                items: [
                  { label: "Scope", value: "app" },
                  { label: "Renderer", value: "Blueprint" },
                  { label: "Status", value: "Active" },
                ],
              },
              {
                type: "actions",
                actions: [
                  {
                    actionId: "redirect",
                    label: "Redirect demo",
                    kind: "primary",
                  },
                ],
              },
            ],
          },
        ],
      };
    }

    if (!serverId) return { pages: [] };

    this.#server(serverId);

    return {
      pages: [
        {
          id: "blueprint-server",
          path: "blueprint",
          label: "Blueprint Demo",
          title: "Server blueprint",
          description:
            "Adapter-provided server pages appear in the sidebar and use the same action runtime.",
          icon: "bolt",
          navGroup: "Extensions",
          order: 50,
          blocks: [
            {
              type: "text",
              body: "This page lives under /server/{id}/blueprint. It was not added to the SvelteKit route table.",
            },
            {
              type: "actions",
              actions: [
                {
                  actionId: "open-console",
                  label: "Open console",
                  kind: "primary",
                },
                { actionId: "notice", label: "Run action", kind: "secondary" },
              ],
            },
          ],
        },
      ],
    };
  }*/

  override async runPanelAction(
    request: PanelActionRequest,
  ): Promise<PanelActionResult> {
    if (request.pageId === "blueprint-app" && request.actionId === "redirect") {
      return {
        prompt: {
          id: "mock-app-redirect",
          scope: "app",
          title: "Redirect demo",
          message:
            "This modal was returned by an adapter action. Confirming will navigate to the dashboard.",
          confirmLabel: "Go to dashboard",
          href: "/dashboard",
          dismissible: true,
        },
      };
    }

    if (
      request.pageId === "blueprint-server" &&
      request.actionId === "notice"
    ) {
      return { message: "Blueprint action executed." };
    }

    if (
      request.pageId === "blueprint-server" &&
      request.actionId === "open-console" &&
      request.serverId
    ) {
      return {
        prompt: {
          id: `mock-console-${request.serverId}`,
          scope: "server",
          serverId: request.serverId,
          title: "Open console?",
          message:
            "This prompt is adapter-provided. Confirming runs another adapter action, which returns a redirect.",
          confirmLabel: "Open console",
          cancelLabel: "Stay here",
          actionId: "redirect-console",
          dismissible: true,
        },
      };
    }

    if (
      request.actionId === "redirect-console" &&
      request.serverId &&
      request.promptId?.startsWith("mock-console-")
    ) {
      return { redirect: `/server/${request.serverId}/console` };
    }

    this.unsupported("runPanelAction");
  }

  override async updateNode(id: string, input: UpdateNode): Promise<Node> {
    const nodes = await this.getNodes();
    const node = nodes.find((entry) => entry.id === id);

    if (!node) {
      throw new AdapterError(`Node ${id} was not found`, "NOT_FOUND");
    }

    const deploymentEnabled = input.deploymentEnabled ?? true;
    const maintenanceEnabled = input.maintenanceEnabled ?? false;

    const servers = this.#servers.filter((server) => server.node === id);
    const allocatedMemory = servers.reduce(
      (sum, server) => sum + server.memory.limit,
      0,
    );
    const allocatedDisk = servers.reduce(
      (sum, server) => sum + server.disk.limit,
      0,
    );
    const full =
      allocatedMemory >= node.memory.limit || allocatedDisk >= node.disk.limit;

    return {
      ...node,
      available: !maintenanceEnabled && deploymentEnabled !== false && !full,
      reason: maintenanceEnabled
        ? "Node is in maintenance"
        : deploymentEnabled === false
          ? "Deployment is disabled"
          : full
            ? "Node is full"
            : undefined,
    };
  }

  override async getNodes(): Promise<Node[]> {
    return NODES.map((name, index) => {
      const servers = this.#servers.filter((server) => server.node === name);
      const memory = 32768 * (index + 1);
      const disk = 102400 * (index + 1);
      const allocatedMemory = this.#servers
        .filter((server) => server.node === name)
        .reduce((sum, server) => sum + server.memory.limit, 0);
      const allocatedDisk = this.#servers
        .filter((server) => server.node === name)
        .reduce((sum, server) => sum + server.disk.limit, 0);
      const full = allocatedMemory >= memory || allocatedDisk >= disk;

      return {
        id: name,
        name,
        memory: { allocated: allocatedMemory, limit: memory },
        disk: { allocated: allocatedDisk, limit: disk },
        servers: servers.length,
        allocations: full ? 0 : 10,
        available: !full,
        reason: full ? "Node is full" : undefined,
        deploymentEnabled: true,
        maintenanceEnabled: false,
      };
    });
  }

  override async createServer(input: CreateServer): Promise<Server> {
    const id = crypto.randomUUID();
    const server: Server = {
      id,
      name: input.name,
      identifier: id.slice(0, 8),
      description: input.description || "Newly provisioned · never started",
      node: input.node ?? NODES[0],
      image: "ghcr.io/pterodactyl/yolks:java_21",
      version: "1.21.10",
      state: "offline",
      cpu: { used: 0, limit: input.cpu ?? 400 },
      memory: { used: 0, limit: input.ram ?? 4096 },
      disk: { used: 0, limit: input.disk ?? 20480 },
      databaseLimit: input.databases ?? 1,
      allocationLimit:
        input.allocations === undefined ? 1 : 1 + input.allocations,
      actions: ["start"],
    };

    this.#servers = [server, ...this.#servers];

    if (input.variables) {
      const startup = this.#startupFor(id);

      for (const [key, value] of Object.entries(input.variables)) {
        const target = startup.variables.find(
          (variable) => variable.key === key,
        );
        if (target?.editable) target.value = value;
      }
    }

    return clone(server);
  }

  override async updateServer(
    id: string,
    input: UpdateServer,
  ): Promise<Server> {
    const server = this.#server(id);

    if (input.name !== undefined) server.name = input.name;
    if (input.description !== undefined) server.description = input.description;
    if (input.cpu !== undefined) server.cpu.limit = input.cpu;
    if (input.ram !== undefined) server.memory.limit = input.ram;
    if (input.disk !== undefined) server.disk.limit = input.disk;
    if (input.databases !== undefined) server.databaseLimit = input.databases;
    if (input.allocations !== undefined)
      server.allocationLimit = input.allocations;

    return clone(server);
  }

  override async deleteServer(id: string): Promise<void> {
    this.#server(id);
    this.#servers = this.#servers.filter((server) => server.id !== id);
    this.#files.delete(id);
    this.#backups.delete(id);
    this.#databases.delete(id);
    this.#schedules.delete(id);
    this.#allocations.delete(id);
    this.#subusers.delete(id);
    this.#activities.delete(id);
    this.#startup.delete(id);
    this.#console.delete(id);
  }

  override async suspendServer(id: string): Promise<void> {
    const server = this.#server(id);
    server.state = "suspended";
    server.actions = [];
    server.cpu.used = 0;
    server.memory.used = 0;
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "WARN",
      text: "Server suspended",
    });
    this.#log(id, "system", "server:suspend", `Suspended ${server.name}`);
  }

  override async unsuspendServer(id: string): Promise<void> {
    const server = this.#server(id);
    server.state = "offline";
    server.actions = ["start"];
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "INFO",
      text: "Server unsuspended",
    });
    this.#log(id, "system", "server:unsuspend", `Unsuspended ${server.name}`);
  }

  #applyPower(id: string, state: Server["state"]) {
    const server = this.#server(id);
    server.state = state;

    if (state === "running") {
      server.actions = ["restart", "stop", "kill"];
      server.cpu.used = Math.max(
        server.cpu.used,
        Math.round(server.cpu.limit * 0.2),
      );
      server.memory.used = Math.max(
        server.memory.used,
        Math.round(server.memory.limit * 0.35),
      );
    } else if (state === "offline") {
      server.actions = ["start"];
      server.cpu.used = 0;
      server.memory.used = 0;
    } else {
      server.actions = ["stop", "kill"];
    }
  }

  override async startServer(id: string): Promise<void> {
    this.#applyPower(id, "running");
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "INFO",
      text: "Container started successfully",
    });
    this.#log(
      id,
      "samir",
      "server:power.start",
      `Started ${this.#server(id).name}`,
    );
  }

  override async stopServer(id: string): Promise<void> {
    this.#applyPower(id, "offline");
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "INFO",
      text: "Container stopped",
    });
    this.#log(
      id,
      "samir",
      "server:power.stop",
      `Stopped ${this.#server(id).name}`,
    );
  }

  override async restartServer(id: string): Promise<void> {
    this.#applyPower(id, "running");
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "INFO",
      text: "Container restarted successfully",
    });
    this.#log(
      id,
      "samir",
      "server:power.restart",
      `Restarted ${this.#server(id).name}`,
    );
  }

  override async killServer(id: string): Promise<void> {
    this.#applyPower(id, "offline");
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "WARN",
      text: "Container killed",
    });
    this.#log(
      id,
      "samir",
      "server:power.kill",
      `Killed ${this.#server(id).name}`,
    );
  }

  override async reinstallServer(id: string): Promise<void> {
    const server = this.#server(id);
    server.state = "offline";
    server.actions = ["start"];
    server.cpu.used = 0;
    server.memory.used = 0;
    this.#consoleFor(id).push({
      time: timeNow(),
      level: "INFO",
      text: "Server reinstalled from its original image",
    });
    this.#log(id, "samir", "server:reinstall", `Reinstalled ${server.name}`);
  }

  override async sendCommand(id: string, command: string): Promise<void> {
    const lines = this.#consoleFor(id);
    lines.push({ time: timeNow(), level: "OUT", text: `> ${command}` });
    lines.push({
      time: timeNow(),
      level: "INFO",
      text: `[Server thread/INFO]: Command "${command}" dispatched`,
    });
    this.#log(id, "samir", "console.command", `Ran "${command}"`);
  }

  override async getConsole(id: string): Promise<ConsoleLine[]> {
    return clone(this.#consoleFor(id));
  }

  override async getResources(id: string): Promise<ResourceUsage> {
    const server = this.#server(id);
    return {
      cpu: server.cpu.used,
      ram: server.memory.used,
      disk: server.disk.used,
      uptime: server.state === "running" ? 3600 : 0,
    };
  }

  override async listAllocations(id: string): Promise<Allocation[]> {
    return clone(this.#allocationsFor(id));
  }

  override async createAllocation(id: string): Promise<Allocation> {
    const allocations = this.#allocationsFor(id);
    const port = Math.max(0, ...allocations.map((entry) => entry.port)) + 1;
    const allocation: Allocation = {
      id: crypto.randomUUID(),
      ip: "0.0.0.0",
      port,
      primary: false,
      notes: null,
      actions: ["primary", "delete"],
    };
    allocations.push(allocation);
    this.#log(id, "samir", "allocation.create", `Allocated port ${port}`);
    return clone(allocation);
  }

  override async deleteAllocation(
    id: string,
    allocationId: string,
  ): Promise<void> {
    const allocations = this.#allocationsFor(id);
    const target = allocations.find((entry) => entry.id === allocationId);
    if (!target)
      throw new AdapterError("Allocation was not found", "NOT_FOUND");
    if (target.primary) {
      throw new AdapterError(
        "The primary allocation cannot be removed",
        "VALIDATION",
      );
    }
    this.#allocations.set(
      id,
      allocations.filter((entry) => entry.id !== allocationId),
    );
  }

  override async setPrimaryAllocation(
    id: string,
    allocationId: string,
  ): Promise<Allocation[]> {
    const allocations = this.#allocationsFor(id);
    if (!allocations.some((entry) => entry.id === allocationId)) {
      throw new AdapterError("Allocation was not found", "NOT_FOUND");
    }

    for (const allocation of allocations) {
      allocation.primary = allocation.id === allocationId;
      allocation.actions = allocation.primary ? [] : ["primary", "delete"];
    }

    return clone(allocations);
  }

  override async listBackups(id: string): Promise<Backup[]> {
    return clone(this.#backupsFor(id));
  }

  override async createBackup(
    id: string,
    input?: CreateBackup,
  ): Promise<Backup> {
    const backups = this.#backupsFor(id);
    const server = this.#server(id);
    const backup: Backup = {
      id: crypto.randomUUID(),
      name:
        input?.name ??
        `${server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-manual`,
      size: 0,
      createdAt: now(),
      status: "running",
      actions: ["download", "restore", "delete"],
    };
    backups.unshift(backup);
    this.#log(id, "samir", "backup.create", `Started backup ${backup.name}`);

    setTimeout(() => {
      backup.status = "completed";
      backup.size = 1_800_000_000 + Math.floor(Math.random() * 200_000_000);
    }, 2500);

    return clone(backup);
  }

  override async deleteBackup(id: string, backupId: string): Promise<void> {
    this.#backups.set(
      id,
      this.#backupsFor(id).filter((backup) => backup.id !== backupId),
    );
  }

  override async restoreBackup(id: string, backupId: string): Promise<void> {
    const backup = this.#backupsFor(id).find((entry) => entry.id === backupId);
    if (!backup) throw new AdapterError("Backup was not found", "NOT_FOUND");
    this.#log(id, "samir", "backup.restore", `Restored ${backup.name}`);
  }

  override async getBackupDownloadUrl(
    id: string,
    backupId: string,
  ): Promise<string | null> {
    this.#server(id);
    const backup = this.#backupsFor(id).find((entry) => entry.id === backupId);
    if (!backup) throw new AdapterError("Backup was not found", "NOT_FOUND");
    return null;
  }

  override async listDatabases(id: string): Promise<Database[]> {
    return clone(this.#databasesFor(id));
  }

  override async createDatabase(
    id: string,
    input: CreateDatabase,
  ): Promise<Database> {
    const databases = this.#databasesFor(id);
    const name = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_");
    if (!name)
      throw new AdapterError("A database name is required", "VALIDATION");

    const database: Database = {
      id: crypto.randomUUID(),
      name,
      host: "db.node-01.neoactyl.local",
      port: 3306,
      username: `${name}_user`,
      actions: ["delete"],
    };
    databases.push(database);
    this.#log(id, "samir", "database.create", `Created database ${name}`);
    return clone(database);
  }

  override async deleteDatabase(id: string, databaseId: string): Promise<void> {
    this.#databases.set(
      id,
      this.#databasesFor(id).filter((database) => database.id !== databaseId),
    );
  }

  override async listSchedules(id: string): Promise<Schedule[]> {
    return clone(this.#schedulesFor(id));
  }

  override async createSchedule(
    id: string,
    input: CreateSchedule,
  ): Promise<Schedule> {
    const schedule: Schedule = {
      id: crypto.randomUUID(),
      name: input.name,
      cron: input.cron,
      action: input.action,
      enabled: input.enabled ?? true,
      lastRun: null,
      nextRun: new Date(Date.now() + 3_600_000).toISOString(),
      actions: ["toggle", "delete"],
    };
    this.#schedulesFor(id).push(schedule);
    return clone(schedule);
  }

  override async updateSchedule(
    id: string,
    scheduleId: string,
    input: UpdateSchedule,
  ): Promise<Schedule> {
    const schedule = this.#schedulesFor(id).find(
      (entry) => entry.id === scheduleId,
    );
    if (!schedule)
      throw new AdapterError("Schedule was not found", "NOT_FOUND");

    if (input.name !== undefined) schedule.name = input.name;
    if (input.cron !== undefined) schedule.cron = input.cron;
    if (input.action !== undefined) schedule.action = input.action;
    if (input.enabled !== undefined) schedule.enabled = input.enabled;
    schedule.nextRun = new Date(Date.now() + 3_600_000).toISOString();

    return clone(schedule);
  }

  override async deleteSchedule(id: string, scheduleId: string): Promise<void> {
    this.#schedules.set(
      id,
      this.#schedulesFor(id).filter((schedule) => schedule.id !== scheduleId),
    );
  }

  override async getStartup(id: string): Promise<Startup> {
    return clone(this.#startupFor(id));
  }

  override async updateStartup(
    id: string,
    input: UpdateStartup,
  ): Promise<Startup> {
    const startup = this.#startupFor(id);

    for (const variable of input.variables) {
      const target = startup.variables.find(
        (entry) => entry.key === variable.key,
      );
      if (!target) continue;
      if (!target.editable) {
        throw new AdapterError(`${variable.key} is not editable`, "VALIDATION");
      }
      target.value = variable.value;
    }

    return clone(startup);
  }

  override async listSubusers(id: string): Promise<Subuser[]> {
    return clone(this.#subusersFor(id));
  }

  override async createSubuser(
    id: string,
    input: CreateSubuser,
  ): Promise<Subuser> {
    const email = input.email.trim().toLowerCase();
    if (!email)
      throw new AdapterError("An email address is required", "VALIDATION");

    const subuser: Subuser = {
      id: crypto.randomUUID(),
      username: email.split("@")[0],
      email,
      permissions: input.permissions ?? ["control.console", "file.read"],
      addedAt: now(),
      actions: ["update", "delete"],
    };

    this.#subusersFor(id).push(subuser);
    this.#log(id, "samir", "subuser.create", `Invited ${email}`);
    return clone(subuser);
  }

  override async updateSubuser(
    id: string,
    subuserId: string,
    input: UpdateSubuser,
  ): Promise<Subuser> {
    const subuser = this.#subusersFor(id).find(
      (entry) => entry.id === subuserId,
    );
    if (!subuser) throw new AdapterError("Subuser was not found", "NOT_FOUND");
    subuser.permissions = [...input.permissions];
    return clone(subuser);
  }

  override async deleteSubuser(id: string, subuserId: string): Promise<void> {
    this.#subusers.set(
      id,
      this.#subusersFor(id).filter((subuser) => subuser.id !== subuserId),
    );
  }

  override async deleteUser(userId: string): Promise<void> {
    // Mock implementation - just log it
    console.log("[mock] deleteUser called for:", userId);
  }

  override async listActivities(id: string): Promise<Activity[]> {
    return clone(this.#activitiesFor(id));
  }

  override async getFileSystem(id: string): Promise<FileSystem> {
    const system = this.#filesFor(id);
    return {
      tree: Object.fromEntries(
        Object.entries(system.tree).map(([directory, entries]) => [
          directory,
          entries.map(fileActions),
        ]),
      ),
    };
  }

  override async listFiles(
    id: string,
    directory: string,
  ): Promise<FileEntry[]> {
    return clone((this.#filesFor(id).tree[directory] ?? []).map(fileActions));
  }

  #locate(id: string, path: string): FileEntry | undefined {
    const { directory, name } = splitPath(path);
    return this.#filesFor(id).tree[directory]?.find(
      (entry) => entry.name === name,
    );
  }

  override async readFile(id: string, path: string): Promise<string> {
    return this.#locate(id, path)?.content ?? "";
  }

  override async writeFile(
    id: string,
    path: string,
    content: string,
  ): Promise<void> {
    const system = this.#filesFor(id);
    const { directory, name } = splitPath(path);
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const entry = list.find((candidate) => candidate.name === name);

    if (entry) {
      entry.content = content;
      entry.size = new TextEncoder().encode(content).length;
      entry.modified = now();
      return;
    }

    list.push(
      fileActions({
        name,
        type: "file",
        size: new TextEncoder().encode(content).length,
        modified: now(),
        content,
      }),
    );
  }

  override async createFile(
    id: string,
    directory: string,
    name: string,
  ): Promise<FileEntry> {
    const system = this.#filesFor(id);
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const entry = fileActions({
      name,
      type: "file",
      size: 0,
      modified: now(),
      content: "",
    });
    list.push(entry);
    return clone(entry);
  }

  override async createDirectory(
    id: string,
    directory: string,
    name: string,
  ): Promise<FileEntry> {
    const system = this.#filesFor(id);
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const entry = fileActions({
      name,
      type: "dir",
      size: null,
      modified: now(),
    });
    list.push(entry);
    system.tree[`${directory}/${name}`] = [];
    return clone(entry);
  }

  #removeTree(id: string, path: string) {
    const system = this.#filesFor(id);
    const prefix = `${path}/`;
    for (const key of Object.keys(system.tree)) {
      if (key.startsWith(prefix)) delete system.tree[key];
    }
  }

  override async deleteFiles(id: string, paths: string[]): Promise<void> {
    const system = this.#filesFor(id);
    for (const path of paths) {
      const { directory, name } = splitPath(path);
      const list = system.tree[directory];
      if (list)
        system.tree[directory] = list.filter((entry) => entry.name !== name);
      this.#removeTree(id, path);
    }
  }

  override async renameFile(
    id: string,
    from: string,
    to: string,
  ): Promise<void> {
    const system = this.#filesFor(id);
    const source = splitPath(from);
    const target = splitPath(to);
    const list = system.tree[source.directory];
    const entry = list?.find((candidate) => candidate.name === source.name);
    if (!entry || !list)
      throw new AdapterError("File was not found", "NOT_FOUND");

    entry.name = target.name;
    entry.modified = now();

    if (entry.type === "dir") {
      const sourcePrefix = `${from.replace(/\/+$/, "")}/`;
      const targetPrefix = `${to.replace(/\/+$/, "")}/`;
      for (const [key, entries] of Object.entries(system.tree)) {
        if (!key.startsWith(sourcePrefix)) continue;
        system.tree[`${targetPrefix}${key.slice(sourcePrefix.length)}`] =
          entries;
      }
      this.#removeTree(id, sourcePrefix.slice(0, -1));
    }
  }

  override async copyFile(id: string, from: string, to: string): Promise<void> {
    const system = this.#filesFor(id);
    const source = splitPath(from);
    const target = splitPath(to);
    const entry = system.tree[source.directory]?.find(
      (candidate) => candidate.name === source.name,
    );
    if (!entry) throw new AdapterError("File was not found", "NOT_FOUND");

    const list =
      system.tree[target.directory] ?? (system.tree[target.directory] = []);
    const copy = clone({ ...entry, name: target.name, modified: now() });
    list.push(copy);

    if (entry.type === "dir") {
      const sourcePrefix = `${from.replace(/\/+$/, "")}/`;
      const targetPrefix = `${to.replace(/\/+$/, "")}/`;
      for (const [key, entries] of Object.entries(system.tree)) {
        if (!key.startsWith(sourcePrefix)) continue;
        system.tree[`${targetPrefix}${key.slice(sourcePrefix.length)}`] =
          clone(entries);
      }
    }
  }

  override async compressFiles(
    id: string,
    paths: string[],
    name: string,
  ): Promise<FileEntry> {
    const system = this.#filesFor(id);
    const directory = splitPath(paths[0] ?? FILES_ROOT).directory;
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const entry = fileActions({
      name,
      type: "file",
      size: 1024 * 1024 * 48,
      modified: now(),
    });
    list.push(entry);
    return clone(entry);
  }

  override async decompressFile(id: string, path: string): Promise<void> {
    const system = this.#filesFor(id);
    const { directory, name } = splitPath(path);
    const base = name.replace(ARCHIVE, "");
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const asDirectory = /\.(tar\.gz|zip|tgz|rar|7z)$/i.test(name);

    if (asDirectory) {
      list.push(
        fileActions({ name: base, type: "dir", size: null, modified: now() }),
      );
      system.tree[`${directory}/${base}`] = [
        fileActions({
          name: "README.txt",
          type: "file",
          size: 42,
          modified: now(),
          content: `Extracted from ${name}.\n`,
        }),
      ];
      return;
    }

    const content = `// Extracted from ${name}\n`;
    list.push(
      fileActions({
        name: base,
        type: "file",
        size: content.length,
        modified: now(),
        content,
      }),
    );
  }

  override async uploadFiles(
    id: string,
    directory: string,
    files: UploadFile[],
  ): Promise<FileEntry[]> {
    const system = this.#filesFor(id);
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const created = files.map((file) =>
      fileActions({
        name: file.name,
        type: "file" as const,
        size: file.size,
        modified: now(),
        content: typeof file.content === "string" ? file.content : "",
      }),
    );
    list.push(...created);
    return clone(created);
  }

  override async downloadToServer(
    id: string,
    directory: string,
    filename: string,
    url: string,
  ): Promise<FileEntry> {
    const system = this.#filesFor(id);
    const list = system.tree[directory] ?? (system.tree[directory] = []);
    const entry = fileActions({
      name: filename,
      type: "file",
      size: 1024 * 1024,
      modified: now(),
      content: `Downloaded from ${url} by the addon installer.\n`,
    });
    list.push(entry);
    this.#log(id, "samir", "file.download", `Installed ${filename}`);
    return clone(entry);
  }

  override async listSoftwares(): Promise<Software[]> {
    return [
      {
        id: 0,
        groupId: 0,
        name: "Paper",
        description: "High performance Minecraft server",
        versions: [
          { id: "paper-26.3", name: "26.3", latest: true },
          { id: "paper-1.21.10", name: "1.21.10", latest: false },
        ],
      },
      {
        id: 1,
        groupId: 0,
        name: "Vanilla",
        description: "Official Minecraft server",
        versions: [{ id: "vanilla-1.21.10", name: "1.21.10", latest: true }],
      },
    ];
  }

  override async listSoftwareGroups(): Promise<SoftwareGroup[]> {
    return [{ id: 0, name: "Minecraft", description: "Java Edition servers" }];
  }

  override async getSoftwareVariables(): Promise<SoftwareVariable[]> {
    return [
      {
        key: "SERVER_JARFILE",
        name: "Server Jar File",
        description: "The jar file executed when the server starts.",
        defaultValue: "server.jar",
        editable: true,
      },
      {
        key: "MC_VERSION",
        name: "Minecraft Version",
        description: "Version used to resolve the server software build.",
        defaultValue: "latest",
        editable: true,
      },
      {
        key: "BUILD_NUMBER",
        name: "Build Number",
        description: 'Specific build to install, or "latest".',
        defaultValue: "latest",
        editable: true,
      },
      {
        key: "SERVER_MEMORY",
        name: "Server Memory",
        description: "Memory limit in megabytes, managed by the panel.",
        defaultValue: "1024",
        editable: false,
      },
    ];
  }
}
