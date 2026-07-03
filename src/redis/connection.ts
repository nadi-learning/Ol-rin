import { Redis } from "ioredis";
import { env } from "../config/env";

// Shared ioredis connection for BullMQ. maxRetriesPerRequest: null is required
// by BullMQ workers/queues.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Fresh connection factory — used by the SSE stream bus (src/sse/stream_bus.ts).
// pub/sub mode is exclusive on a connection, so each subscribe() opens its own.
// Ported from Starkhorn's worker/queue.makeRedisConnection.
export function makeRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
