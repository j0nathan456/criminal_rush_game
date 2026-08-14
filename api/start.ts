import type { VercelRequest, VercelResponse } from '@vercel/node';
import { startRoom, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { newGame } from '../src/setup/newGame.js';
import { body, fail } from './_lib.js';

/** POST /api/start { code, token } → { view }. Host starts the game. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token } = body<{ code?: string; token?: string }>(req);
    if (!code || !token) throw new Error('code and token are required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = startRoom(room, { token, newGame });
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
