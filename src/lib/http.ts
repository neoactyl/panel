export const PANEL_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `The panel did not respond within ${Math.round(timeoutMs / 1000)} seconds.`,
    );
    this.name = "FetchTimeoutError";
  }
}

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = PANEL_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const source = init.signal;
  let timedOut = false;

  const forwardAbort = () => controller.abort(source?.reason);
  if (source) {
    if (source.aborted) forwardAbort();
    else source.addEventListener("abort", forwardAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (cause) {
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw cause;
  } finally {
    clearTimeout(timer);
    source?.removeEventListener("abort", forwardAbort);
  }
};
