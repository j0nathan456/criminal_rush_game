/**
 * api/_lib.ts — shared helpers for the serverless handlers. The leading
 * underscore keeps Vercel from exposing this file as a route.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { RoomError } from '../src/online/room.js';

/** A fresh, opaque per-player secret. */
export function newToken(): string {
  return randomUUID();
}

/** Parse a JSON body whether Vercel gave us a string or a parsed object. */
export function body<T = Record<string, unknown>>(req: VercelRequest): T {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  return (req.body ?? {}) as T;
}

/** Read a single string query param. */
export function query(req: VercelRequest, name: string): string {
  const v = req.query[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/** Map an error to an HTTP response (RoomError → 400, else 500). */
export function fail(res: VercelResponse, err: unknown): void {
  if (err instanceof RoomError) {
    res.status(400).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal error';
  res.status(500).json({ error: message });
}
