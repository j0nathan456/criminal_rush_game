/**
 * api/_store.ts
 *
 * Room persistence (server-only; the leading underscore keeps it off the route
 * table). Uses Upstash Redis when its env vars are present (Vercel
 * production / preview), and falls back to a per-process in-memory Map when
 * they're absent (handy for `vercel dev` locally). Only imported by the
 * serverless API handlers — never by the browser bundle.
 */

import { Redis } from '@upstash/redis';
import type { Room } from '../src/online/protocol.js';

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

/** Per-process fallback store (does not persist across serverless instances). */
const memory = new Map<string, Room>();

const TTL_SECONDS = 60 * 60 * 24; // rooms expire after 24h
const key = (code: string) => `room:${code.toUpperCase()}`;

export function usingMemoryStore(): boolean {
  return redis === null;
}

export async function getRoom(code: string): Promise<Room | null> {
  if (redis) return (await redis.get<Room>(key(code))) ?? null;
  return memory.get(key(code)) ?? null;
}

export async function saveRoom(room: Room): Promise<void> {
  if (redis) {
    await redis.set(key(room.code), room, { ex: TTL_SECONDS });
    return;
  }
  memory.set(key(room.code), room);
}

export async function deleteRoom(code: string): Promise<void> {
  if (redis) {
    await redis.del(key(code));
    return;
  }
  memory.delete(key(code));
}
