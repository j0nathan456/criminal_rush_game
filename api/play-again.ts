import type { VercelRequest, VercelResponse } from '@vercel/node';
import { playAgain, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { body, fail } from './_lib.js';

/**
 * POST /api/play-again { code, token, name } → { view }.
 * Called from a finished game's "Play again" button. The caller's existing
 * token is reused (they're already a room member, or — for a straggler
 * rejoining a rematch someone else already started — becoming one). See
 * playAgain() for what actually happens on the first call vs. later ones.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token, name } = body<{ code?: string; token?: string; name?: string }>(req);
    if (!code || !token) throw new Error('code and token are required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = playAgain(room, token, name ?? '');
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
