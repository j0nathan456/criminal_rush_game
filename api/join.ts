import type { VercelRequest, VercelResponse } from '@vercel/node';
import { joinRoom, rejoinRoom, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { body, newToken, fail } from './_lib.js';

/**
 * POST /api/join { code, name } → { token, view }.
 * Joins an existing not-yet-started room, or — if the room has already
 * started — rejoins by matching `name` against an existing seat and
 * reissuing it a token (see rejoinRoom), so a player who lost their session
 * (cleared storage, a new device, a stray "Leave") can get back in.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, name } = body<{ code?: string; name?: string }>(req);
    if (!code) throw new Error('A room code is required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const token = newToken();
    const updated = room.started ? rejoinRoom(room, token, name ?? '') : joinRoom(room, token, (name ?? '').trim());
    await saveRoom(updated);

    res.status(200).json({ token, view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
