// Lightweight Redis pub/sub bus used to stream AI token events from any
// producer (an HTTP-direct chat turn, or a BullMQ worker job) to a Hono SSE
// endpoint. Each stream is keyed by an opaque `streamKey` (uuid) generated
// FE-side and threaded into the mutation that triggers the AI call.
//
// Ported from Starkhorn (nadi-backend/src/sse/stream_bus.ts). The only b2c
// change is the connection import (b2c's redis/connection.makeRedisConnection).
//
// Fire-and-forget — no buffering. The FE must subscribe BEFORE the producer
// starts publishing or it'll miss leading tokens. In practice the producer is
// always at least one network roundtrip behind, so the FE subscribe-then-mutate
// pattern is safe.
//
// b2c staging note (AUTH-v2 Stage-1): the vendor bodies publish here when a
// `streamKey` is set, but the SSE Hono ROUTE + FE consumption land in Stage-2.
// Stage-1 runs request-response (no streamKey); this bus is wired but idle.

import type Redis from "ioredis";
import { makeRedisConnection } from "../redis/connection";
import type { ToolUseEvent } from "../services/ai/types";

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "progress"; phase: string; meta?: Record<string, unknown> }
  | { type: "done"; payload?: unknown }
  | { type: "error"; message: string }
  | { type: "tool_event"; event: ToolUseEvent };

function channel(streamKey: string): string {
  return `nadi:stream:${streamKey}`;
}

let pubConn: Redis | null = null;
function pub(): Redis {
  if (!pubConn) pubConn = makeRedisConnection();
  return pubConn;
}

/** Publish a single event. Best-effort; failures are swallowed. */
export async function publish(streamKey: string, ev: StreamEvent): Promise<void> {
  try {
    await pub().publish(channel(streamKey), JSON.stringify(ev));
  } catch {
    /* never let stream publish failures break the underlying work */
  }
}

/**
 * Async iterator of events for a streamKey. Closes when `signal` aborts or
 * after a terminal event (done/error). Each subscribe() call opens a fresh
 * Redis connection (pub/sub mode is exclusive on a connection).
 */
export async function* subscribe(
  streamKey: string,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent, void, void> {
  const conn = makeRedisConnection();
  const queue: StreamEvent[] = [];
  let pendingResolve: (() => void) | null = null;
  let aborted = false;

  const wakeup = () => {
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  };

  conn.on("message", (_chan: string, message: string) => {
    try {
      const ev = JSON.parse(message) as StreamEvent;
      queue.push(ev);
      wakeup();
    } catch {
      /* skip malformed */
    }
  });

  signal.addEventListener("abort", () => {
    aborted = true;
    wakeup();
  });

  try {
    await conn.subscribe(channel(streamKey));

    while (!aborted) {
      if (queue.length === 0) {
        await new Promise<void>((res) => {
          pendingResolve = res;
        });
        if (aborted) break;
      }
      while (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
        if (ev.type === "done" || ev.type === "error") {
          return;
        }
      }
    }
  } finally {
    try {
      await conn.unsubscribe(channel(streamKey));
    } catch {
      /* noop */
    }
    conn.disconnect();
  }
}

export async function closeBus(): Promise<void> {
  if (pubConn) {
    try {
      await pubConn.quit();
    } catch {
      /* noop */
    }
    pubConn = null;
  }
}
