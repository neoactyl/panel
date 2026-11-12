# Adapters

Adapters let Neoactyl manage servers on different hosting backends without tying the panel to one API. The panel and the UI only see the normalized types in `src/lib/adapter/sdk.ts`.

## Available adapters

| Adapter     | Location                              | Notes                                                                                          |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mock        | `src/lib/server/panel/mock.ts`        | Simulated servers, files, backups, and console. Used for development.                          |
| Calagopus   | `src/lib/server/panel/calagopus.ts`   | Connects to a Calagopus panel using a URL and API token.                                       |
| Pterodactyl | `src/lib/server/panel/pterodactyl.ts` | Connects to a Pterodactyl panel using an Application API key and an optional Client API key.    |

If the configured adapter is Calagopus or Pterodactyl but the URL or token is missing, Neoactyl falls back to Mock.

Pterodactyl exposes two separate APIs. The Application API key (the panel token) is used for server management, nodes, nests and eggs. The optional Client API key enables console streaming, power actions, files, backups, databases, schedules, startup variables, subusers and allocations for servers that key can access.

## How selection works

`getAdapter()` in `src/lib/server/panel/adapter.ts` reads the panel settings and asks the registry for the matching adapter definition:

```ts
const { adapter: kind, url, token, clientToken } = getPanelConfig();
const definition = findPanelAdapter(kind);

adapter = createPanelAdapter(
  definition &&
    (!definition.requiresUrl || Boolean(url)) &&
    (!definition.requiresToken || Boolean(token))
    ? definition.id
    : DEFAULT_PANEL_ADAPTER,
  { url, token, clientToken }
);
```

`createPanelAdapter()` in `src/lib/server/panel/adapters.ts` maps the selected id to its class.

The instance is cached until settings change (`resetAdapter()`). Calls are wrapped so that:

- Errors become `AdapterError` values with a normalized code.
- Failures are written to the activity log.
- Operations on a specific server are checked against the linked panel user when the adapter supports panel accounts.

## The contract

Every adapter extends the abstract `Adapter` class from `src/lib/adapter/sdk.ts`:

```ts
import { Adapter, AdapterError, type AdapterCapabilities } from '#lib/adapter/sdk.ts';

export class MyBackend extends Adapter {
  readonly capabilities: AdapterCapabilities = {
    servers: { list: true, create: true, update: true, delete: true, suspend: true, power: true },
    console: { commands: true, history: true, websocket: true },
    files: { read: true, write: true, upload: true, manage: true },
    allocations: true,
    backups: true,
    databases: false,
    schedules: false,
    startup: true,
    subusers: true,
    activities: true,
    resources: true,
    accounts: { link: true, create: true, delete: true },
    nodes: { list: true, update: false }
  };
}
```

Required methods:

- `connect()`
- `getServers()`
- `getServer(id)`
- `createServer(input)`
- `listSoftwares()`
- `listSoftwareGroups()`

Most other methods have default implementations that throw `AdapterError` with the `UNSUPPORTED` code. Use `this.unsupported('methodName')` for anything the backend genuinely cannot do, and set the matching capability to `false`.

Useful base-class helpers:

- `this.request<T>(path, init)` performs a fetch with the adapter's URL, bearer token, timeout handling, and normalized HTTP errors.
- `this.url` is the configured backend URL.
- `this.token` is the configured API token.

## Normalized types

Return the SDK types, not backend payloads. For example, a server should match `Server`, with `id`, `name`, resource limits, status, and any backend-specific data confined to the adapter:

```ts
type Server = {
  id: string;
  name: string;
  // ...status, limits, resources, and related metadata
};
```

Map backend statuses into the shared set: `running`, `starting`, `stopping`, `offline`, `installing`, `suspended`, or `unknown`.

Throw `AdapterError` with a meaningful code and HTTP status instead of leaking backend error bodies:

```ts
throw new AdapterError('The server does not exist.', 'NOT_FOUND', 404);
```

This keeps UI behavior and activity logs consistent across backends.

## Ownership and accounts

Adapters that expose panel accounts set `capabilities.accounts.*` to `true` and implement:

- `getCurrentUser()`
- `getServerOwner(id)`

The server wraps those adapters so a user can only act on servers they own. `getServers()` is called with the linked panel user's ID. This is a security boundary: do not rely on the UI to enforce ownership, and do not return another user's servers from `getServers(userId)`.

If the backend has no concept of panel accounts, set `accounts.link`, `.create`, and `.delete` to `false`. For those adapters Neoactyl records server ownership in the `server_ownership` table (server id to Neoactyl user id) when a server is created. `getServers()` only returns rows owned by the current user, and every server-scoped method verifies the ownership row before calling the backend. Deleting a server removes its ownership row. Existing servers are backfilled from billing, storefront redemption and entitlement records during startup. The built-in Mock adapter is exempt because it is a single-user demo with pre-seeded sample servers.

The Pterodactyl adapter currently sets all account capabilities to `false`: Pterodactyl does not expose a login endpoint that Neoactyl can use to verify a panel password, so panel accounts are not linked. Ownership is therefore enforced through the database table above. The Application API key manages servers, and the optional Client API key determines which servers expose console, file, power and other client-level features.

## Adding an adapter

1. Create a class under `src/lib/server/panel/` that extends `Adapter`.
2. Implement the required methods and the optional features you can support.
3. Declare all capability groups and booleans accurately.
4. Add the adapter to the selection logic in `src/lib/server/panel/adapter.ts`.
5. Allow the adapter to be selected during setup and in the admin settings UI.
6. Add any required configuration to panel settings, with defaults in `src/lib/server/config/settings.ts`.
7. Write tests for payload normalization and error mapping where the logic is non-trivial.
8. Update this document and the adapter table in the README.

Keep backend-specific assumptions inside the adapter. If the UI needs to branch on behavior, add a capability instead of checking the adapter's class name.

## Testing an adapter

- Use the Mock adapter as the reference for expected UI behavior.
- For a real backend, verify connection failures, expired tokens, missing servers, and unsupported features.
- Check that list operations do not leak servers owned by other users.
- Check that errors appear as safe messages and are recorded in the activity log.
- `scripts/adapter-test.ts` can be used as a starting point for a quick manual exercise.

## Contract versioning

`ADAPTER_CONTRACT_VERSION` is currently `1`. `assertAdapterContract()` rejects adapters with a mismatched version or incomplete capabilities. If you change the base contract in a breaking way, bump the version and update every adapter in the same change.
