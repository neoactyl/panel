import { getContext, setContext } from "svelte";
import { adapter } from "#lib/adapter/client.ts";
import { sound } from "#lib/client/sound.ts";
import type {
  Allocation,
  ConsoleLine,
  Server,
  ServerAction,
  ServerState,
} from "#lib/adapter/sdk.ts";

export function createServerPanel(
  server: Server,
  initialLines: ConsoleLine[],
  initialAllocations: Allocation[],
) {
  let powerState = $state<ServerState>(server.state);
  let actions = $state<ServerAction[]>([...server.actions]);
  let powerPending = $state(false);
  let lines = $state<ConsoleLine[]>([...initialLines]);
  let notice = $state("");
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  const allocations = $state<Allocation[]>([...initialAllocations]);

  const primary = $derived(
    allocations.find((entry) => entry.primary) ?? allocations[0],
  );
  const address = $derived(primary ? `${primary.ip}:${primary.port}` : "—");

  const pushLine = (line: Omit<ConsoleLine, "time">) => {
    lines.push({ ...line, time: new Date().toLocaleTimeString() });
    if (lines.length > 250) lines.splice(0, lines.length - 250);
  };

  const syncLines = (next: ConsoleLine[]) => {
    lines = [...next];
  };

  const showNotice = (message: string) => {
    notice = message;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = ""), 2500);
  };

  const applyServer = (next: Server) => {
    powerState = next.state;
    actions = [...next.actions];
  };

  const refresh = async () => {
    try {
      applyServer(await adapter.getServer(server.id));
    } catch {
      /* keep the last known state on transient errors */
    }
  };

  const runPower = async (action: ServerAction) => {
    if (powerPending) return;
    powerPending = true;
    powerState =
      action === "start" || action === "restart" ? "starting" : "stopping";

    try {
      if (action === "start") await adapter.startServer(server.id);
      else if (action === "stop") await adapter.stopServer(server.id);
      else if (action === "restart") await adapter.restartServer(server.id);
      else await adapter.killServer(server.id);

      await refresh();
      sound.play(action === "start" ? "success" : "error");
      pushLine({
        level: "INFO",
        text: `Container ${action} completed successfully`,
      });
    } catch (cause) {
      sound.play("error");
      showNotice(
        cause instanceof Error ? cause.message : "Power action failed.",
      );
      await refresh();
    } finally {
      powerPending = false;
    }
  };

  return {
    get server() {
      return server;
    },
    get powerState() {
      return powerState;
    },
    get actions() {
      return actions;
    },
    get powerPending() {
      return powerPending;
    },
    get lines() {
      return lines;
    },
    get notice() {
      return notice;
    },
    get allocations() {
      return allocations;
    },
    get address() {
      return address;
    },
    power: runPower,
    refresh,
    setPowerState: (state: ServerState) => (powerState = state),
    pushLine,
    syncLines,
    showNotice,
  };
}

export type ServerPanel = ReturnType<typeof createServerPanel>;

const KEY = Symbol("server-panel");

export const setServerPanel = (panel: ServerPanel) => setContext(KEY, panel);

export const getServerPanel = () => getContext<ServerPanel>(KEY);
