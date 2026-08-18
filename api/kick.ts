import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kickPlayer, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { body, fail } from './_lib.js';

/** POST /api/kick { code, token, targetSeat } → { view }. Host removes a not-yet-started player. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token, targetSeat } = body<{ code?: string; token?: string; targetSeat?: number }>(req);
    if (!code || !token || targetSeat === undefined) {
      throw new Error('code, token, and targetSeat are required.');
    }

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = kickPlayer(room, { hostToken: token, targetSeat });
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
