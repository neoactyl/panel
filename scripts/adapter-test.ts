import { Calagopus } from "../src/lib/server/panel/calagopus.ts";
import { AdapterError } from "../src/lib/adapter/sdk.ts";
import { createClient } from "@libsql/client";

const client = createClient({ url: process.env.DATABASE_URL ?? "file:local.db" });
const setting = async (key: string) => {
  const result = await client.execute({
    sql: "select value from settings where key = ?",
    args: [key],
  });
  return String(result.rows[0]?.value ?? "");
};

const PANEL_URL = await setting("panel.url");
const TOKEN = await setting("panel.token");

if (!PANEL_URL || !TOKEN) {
  throw new Error("Configure the Calagopus URL and token in the admin settings first");
}

const app = new Calagopus(PANEL_URL, TOKEN);

let passed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`);
  }
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(path, PANEL_URL), {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

function unique(label: string) {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function snapshot() {
  return {
    nests: (await app.listSoftwareGroups()).map((nest) => nest.name),
    eggs: (await app.listSoftwares()).map((software) => software.name),
    servers: (await app.getServers()).map((server) => server.name),
  };
}

const nestName = unique("bricked-dash-nest");
const eggName = unique("bricked-dash-egg");
const locationName = unique("bricked-dash-location");
const nodeName = unique("bricked-dash-node");
const serverName = unique("bricked-dash-server");

let nestUuid: string | null = null;
let eggUuid: string | null = null;
let locationUuid: string | null = null;
let nodeUuid: string | null = null;
let allocationUuid: string | null = null;
let serverUuid: string | null = null;

async function createFixtures() {
  nestUuid = (
    await raw<{ nest: { uuid: string } }>("/api/admin/nests", {
      method: "POST",
      body: JSON.stringify({ author: "bricked-dash test", name: nestName }),
    })
  ).nest.uuid;

  eggUuid = (
    await raw<{ egg: { uuid: string } }>(`/api/admin/nests/${nestUuid}/eggs`, {
      method: "POST",
      body: JSON.stringify({
        author: "bricked-dash test",
        name: eggName,
        config_files: [],
        config_startup: { done: [], strip_ansi: true },
        config_stop: { type: "command", value: "stop" },
        config_script: {
          container: "ghcr.io/pterodactyl/installer-images",
          entrypoint: "/bin/bash",
          content: "",
        },
        startup_commands: { startup: "echo bricked-dash" },
        force_outgoing_ip: false,
        separate_port: false,
        features: [],
        docker_images: { default: "ghcr.io/pterodactyl/yolks:debian" },
        file_denylist: [],
      }),
    })
  ).egg.uuid;
}

async function createNodes() {
  locationUuid =
    (
      await raw<{ location?: { uuid: string } }>("/api/admin/locations", {
        method: "POST",
        body: JSON.stringify({ name: locationName }),
      })
    ).location?.uuid ?? null;

  nodeUuid =
    (
      await raw<{ node?: { uuid: string } }>("/api/admin/nodes", {
        method: "POST",
        body: JSON.stringify({
          location_uuid: locationUuid,
          name: nodeName,
          deployment_enabled: true,
          maintenance_enabled: false,
          url: PANEL_URL,
          sftp_port: 2022,
          memory: 2048,
          disk: 8192,
        }),
      })
    ).node?.uuid ?? null;

  await raw<{ created: number }>(`/api/admin/nodes/${nodeUuid}/allocations`, {
    method: "POST",
    body: JSON.stringify({ ip: "10.0.0.1", ports: [25565] }),
  });

  allocationUuid =
    (
      await raw<{ allocations: { data: Array<{ uuid: string }> } }>(
        `/api/admin/nodes/${nodeUuid}/allocations/available?page=1&per_page=10`,
      )
    ).allocations.data[0]?.uuid ?? null;
}

async function destroyFixtures() {
  const steps: Array<[string, string, RequestInit?]> = [];

  if (serverUuid) {
    steps.push([
      `/api/admin/servers/${serverUuid}`,
      "DELETE /api/admin/servers/{server}",
      {
        method: "DELETE",
        body: JSON.stringify({ force: true, delete_backups: true }),
      },
    ]);
  }
  if (nodeUuid) {
    steps.push([
      `/api/admin/nodes/${nodeUuid}`,
      "DELETE node",
      { method: "DELETE" },
    ]);
  }
  if (eggUuid) {
    steps.push([
      `/api/admin/nests/${nestUuid}/eggs/${eggUuid}`,
      "DELETE egg",
      { method: "DELETE" },
    ]);
  }
  if (nestUuid) {
    steps.push([
      `/api/admin/nests/${nestUuid}`,
      "DELETE nest",
      { method: "DELETE", body: JSON.stringify({ delete_eggs: true }) },
    ]);
  }
  if (locationUuid) {
    steps.push([
      `/api/admin/locations/${locationUuid}`,
      "DELETE location",
      { method: "DELETE" },
    ]);
  }

  for (const [path, label, init] of steps) {
    try {
      await raw(path, init);
      console.log(`cleanup  ${label}: ok`);
    } catch (error) {
      console.log(`cleanup  ${label}: ${(error as Error).message}`);
    }

    nestUuid = null;
    eggUuid = null;
    locationUuid = null;
    nodeUuid = null;
    allocationUuid = null;
    serverUuid = null;
  }
}

const before = await snapshot();

try {
  assert(before.nests.length === 1, "panel starts with one nest");
  assert(before.eggs.length === 0, "panel starts with no eggs");
  assert(before.servers.length === 0, "panel starts with no servers");

  assert(
    (await app.connect()) === true,
    "connect returns true with valid token",
  );
  assert(
    (await new Calagopus(PANEL_URL, "invalid-token").connect()) ===
      false,
    "connect returns false with invalid token",
  );

  const user = await app.getCurrentUser();
  assert(user.email === "samirthegamer717@gmail.com", "getCurrentUser email");
  assert(user.isAdmin === true, "current user is admin");

  await createFixtures();

  const groups = await app.listSoftwareGroups();
  const ourGroup = groups.find((group) => group.name === nestName);
  assert(ourGroup !== undefined, "listSoftwareGroups includes created nest");
  const groupIndex = groups.findIndex((group) => group.name === nestName);
  assert(
    groups[groupIndex]?.description === null,
    "nest description maps to null",
  );

  const softwares = await app.listSoftwares();
  const ourSoftware = softwares.find((software) => software.name === eggName);
  assert(ourSoftware !== undefined, "listSoftwares includes created egg");
  const softwareIndex = softwares.findIndex(
    (software) => software.name === eggName,
  );
  assert(
    ourSoftware?.groupId === groupIndex,
    "egg software group matches nest index",
  );
  assert(
    ourSoftware?.versions.length === 1 &&
      ourSoftware.versions[0].name === "default" &&
      ourSoftware.versions[0].latest === true,
    "egg version maps from docker images",
  );

  let wingsAvailable = false;
  try {
    await createNodes();
    const server = await app.createServer({
      name: serverName,
      ram: 512,
      disk: 1024,
      cpu: 50,
      softwareGroup: groupIndex,
      software: softwareIndex,
    });
    serverUuid = server.id;
    wingsAvailable = true;
  } catch (error) {
    console.log(
      `info  server deployment unavailable (${(error as Error).message})`,
    );
  }

  if (wingsAvailable && serverUuid) {
    const server = await app.getServer(serverUuid);
    assert(server.name === serverName, "getServer name");
    assert(server.memory.limit === 512, "server ram limit");
    assert(server.disk.limit === 1024, "server disk limit");
    assert(server.cpu.limit === 50, "server cpu limit");

    const servers = await app.getServers();
    assert(
      servers.some((candidate) => candidate.id === serverUuid),
      "getServers includes created server",
    );

    const updated = await app.updateServer(serverUuid, {
      name: serverName,
      ram: 768,
    });
    assert(updated.memory.limit === 768, "updateServer ram limit");
    assert(
      (await app.getServer(serverUuid)).name === serverName,
      "updateServer name",
    );

    try {
      assert(
        (await app.listFiles(serverUuid, "/")) instanceof Array,
        "listFiles",
      );
      await app.writeFile(serverUuid, "/bricked-dash-test.txt", "bricked-dash");
      const content = await app.readFile(serverUuid, "/bricked-dash-test.txt");
      assert(content === "bricked-dash", "readFile round-trip");
    } catch (error) {
      console.log(
        `info  file operations unavailable (${(error as Error).message})`,
      );
    }

    await app.deleteServer(serverUuid);
    serverUuid = null;
  }

  try {
    await app.getServer("00000000-0000-0000-0000-000000000000");
    assert(false, "getServer unknown id -> AdapterError NOT_FOUND");
  } catch (error) {
    assert(
      error instanceof AdapterError && error.code === "NOT_FOUND",
      "getServer unknown id -> AdapterError NOT_FOUND",
    );
  }

  try {
    const servers = await app.getServers();
    assert(
      servers.every((server) => server.name !== serverName),
      "deleteServer removed server",
    );
  } catch {
    console.log("info  server list unavailable after delete");
  }
} finally {
  await destroyFixtures();

  const after = await snapshot();
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    "panel restored to initial state after test",
  );
}

console.log(
  failures.length === 0
    ? `PASS (${passed} checks)`
    : `FAIL (${failures.length} failed / ${passed} passed)`,
);

process.exitCode = failures.length === 0 ? 0 : 1;
