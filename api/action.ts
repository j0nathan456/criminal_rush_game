import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyAction, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { gameReducer } from '../src/engine/index.js';
import type { GameAction } from '../src/engine/index.js';
import { body, fail } from './_lib.js';

/** POST /api/action { code, token, action } → { view }. Dispatches an engine action. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token, action } = body<{ code?: string; token?: string; action?: GameAction }>(req);
    if (!code || !token || !action) throw new Error('code, token and action are required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = applyAction(room, { token, action, reducer: gameReducer });
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
