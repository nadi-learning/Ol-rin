// HTTP client for `nadi-pyrender` (Slice IMG) — POST a Python matplotlib script,
// get PNG bytes back. Ported near-verbatim from Starkhorn's nadi-backend
// (services/matplotlib.ts); the sidecar contract is identical.
//
// Pyrender runs at PYRENDER_URL (default http://127.0.0.1:8002). In dev we reuse
// the same instance Starkhorn runs (stateless rendering); on deploy b2c runs its
// own. See /Users/mab/Desktop/nadi/nadi-pyrender/server.py for the contract.

import { env } from "../config/env";

export interface RenderRequest {
  script: string;
  /** Override matplotlib DPI for the output (50–300). */
  dpi?: number;
  /** Render-side wall-clock timeout (advisory until pyrender moves to multiprocessing). */
  timeoutSec?: number;
  /** Client-side fetch timeout — kills the request if pyrender hangs. */
  fetchTimeoutMs?: number;
}

export interface PyrenderErrorBody {
  error: string;
  message: string;
  traceback?: string;
}

export class PyrenderError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly traceback?: string,
  ) {
    super(message);
    this.name = "PyrenderError";
  }
}

const base = () => env.PYRENDER_URL.replace(/\/+$/, "");

/** POST a matplotlib script to the sidecar; returns the rendered PNG bytes. */
export async function renderScript(req: RenderRequest): Promise<Uint8Array> {
  const ac = new AbortController();
  const fetchTimeout = req.fetchTimeoutMs ?? 60_000;
  const killer = setTimeout(() => ac.abort(), fetchTimeout);

  let res: Response;
  try {
    res = await fetch(`${base()}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: req.script,
        dpi: req.dpi,
        timeout_sec: req.timeoutSec,
      }),
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(killer);
    if ((err as Error).name === "AbortError") {
      throw new PyrenderError(
        `pyrender did not respond within ${fetchTimeout}ms (is it running on ${base()}?)`,
        0,
      );
    }
    throw new PyrenderError(`pyrender request failed: ${(err as Error).message}`, 0);
  }
  clearTimeout(killer);

  if (!res.ok) {
    let detail: { detail?: PyrenderErrorBody } | null = null;
    try {
      detail = (await res.json()) as { detail?: PyrenderErrorBody };
    } catch {
      /* not json */
    }
    const message = detail?.detail?.message ?? `pyrender returned ${res.status}`;
    throw new PyrenderError(message, res.status, detail?.detail?.traceback);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** Liveness ping — used by the probe to skip cleanly when the sidecar is down. */
export async function pyrenderHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
