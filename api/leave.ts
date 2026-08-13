import type { VercelRequest, VercelResponse } from '@vercel/node';
import { leaveRoom } from '../src/online/room';
import { getRoom, saveRoom, deleteRoom } from './_store';
import { body, fail } from './_lib';

/**
 * POST /api/leave { code, token } → { ok }. Releases the caller's seat in a
 * not-yet-started room (and deletes the room if it becomes empty). Best-effort:
 * a missing room is treated as already gone.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token } = body<{ code?: string; token?: string }>(req);
    if (!code || !token) {
      res.status(200).json({ ok: true });
      return;
    }

    const room = await getRoom(code);
    if (!room) {
      res.status(200).json({ ok: true });
      return;
    }

    const updated = leaveRoom(room, token);
    if (updated.players.length === 0) {
      await deleteRoom(updated.code);
    } else {
      await saveRoom(updated);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
