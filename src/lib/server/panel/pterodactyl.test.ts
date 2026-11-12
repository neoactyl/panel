import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterError } from "#lib/adapter/sdk.ts";
import { Pterodactyl } from "./pterodactyl.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const serverAttributes = {
  id: 7,
  uuid: "uuid-7",
  identifier: "abc12345",
  name: "Test Server",
  description: "A test server",
  status: null,
  suspended: false,
  user: 3,
  node: 2,
  allocation: 11,
  limits: { memory: 512, disk: 1024, cpu: 50, swap: 0, io: 500 },
  feature_limits: { databases: 1, allocations: 2, backups: 2 },
  container: { image: "ghcr.io/pterodactyl/yolks:java_21" },
  relationships: {
    user: {
      attributes: { id: 3, uuid: "uuid-user", username: "owner", email: "o@e.com" },
    },
    node: { attributes: { id: 2, name: "Node A" } },
    allocations: {
      data: [
        { attributes: { id: 11, ip: "10.0.0.1", port: 25565 } },
        { attributes: { id: 12, ip: "10.0.0.1", port: 25566 } },
      ],
    },
  },
};

const route = (
  url: URL,
  handlers: Record<string, () => Response>,
): Response => {
  const handler = handlers[url.pathname];
  if (handler) return handler();
  return json({ errors: [{ detail: "Not found" }] }, 404);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pterodactyl adapter", () => {
  it("normalizes server lists and merges client resource usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        return route(url, {
          "/api/application/servers": () =>
            json({
              data: [{ attributes: serverAttributes }],
              meta: { pagination: { total_pages: 1 } },
            }),
          "/api/client/servers": () =>
            json({
              data: [
                {
                  attributes: {
                    identifier: "abc12345",
                    uuid: "uuid-7",
                    internal_id: 7,
                    name: "Test Server",
                    status: "running",
                    is_suspended: false,
                    limits: { memory: 512, disk: 1024, cpu: 50 },
                  },
                },
              ],
              meta: { pagination: { total_pages: 1 } },
            }),
          "/api/client/servers/abc12345/resources": () =>
            json({
              attributes: {
                current_state: "running",
                is_suspended: false,
                resources: {
                  memory_bytes: 1024 * 1024,
                  cpu_absolute: 12.4,
                  disk_bytes: 2 * 1024 * 1024,
                  uptime: 99,
                },
              },
            }),
        });
      }),
    );

    const adapter = new Pterodactyl(
      "https://panel.example.com",
      "ptla_application",
      "ptlc_client",
    );

    const [server] = await adapter.getServers();

    expect(server).toMatchObject({
      id: "7",
      identifier: "abc12345",
      name: "Test Server",
      node: "Node A",
      state: "running",
      ownerId: "uuid-user",
      cpu: { used: 12, limit: 50 },
      memory: { used: 1, limit: 512 },
      disk: { used: 2, limit: 1024 },
    });
  });

  it("maps Pterodactyl error responses to AdapterError codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { errors: [{ code: "NotFoundHttpException", detail: "Server not found" }] },
          404,
        ),
      ),
    );

    const adapter = new Pterodactyl(
      "https://panel.example.com",
      "ptla_application",
    );

    await expect(adapter.getServer("123")).rejects.toMatchObject({
      name: "AdapterError",
      code: "NOT_FOUND",
      statusCode: 404,
      message: "Server not found",
    } satisfies Partial<AdapterError>);
  });

  it("only advertises client features when a client token is configured", () => {
    const withoutClient = new Pterodactyl("https://panel.example.com", "ptla_x");
    const withClient = new Pterodactyl(
      "https://panel.example.com",
      "ptla_x",
      "ptlc_y",
    );

    expect(withoutClient.capabilities.servers.power).toBe(false);
    expect(withoutClient.capabilities.files.read).toBe(false);
    expect(withClient.capabilities.servers.power).toBe(true);
    expect(withClient.capabilities.files.read).toBe(true);
  });
});
