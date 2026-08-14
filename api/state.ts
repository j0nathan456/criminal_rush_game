import type { VercelRequest, VercelResponse } from '@vercel/node';
import { viewFor } from '../src/online/room.js';
import { getRoom } from './_store.js';
import { query, fail } from './_lib.js';

/** GET /api/state?code=&token= → RoomView. Polled by clients for updates. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const code = query(req, 'code');
    const token = query(req, 'token');
    if (!code) throw new Error('A room code is required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    // Avoid any intermediary caching the polled state.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(viewFor(room, token));
  } catch (err) {
    fail(res, err);
  }
}
