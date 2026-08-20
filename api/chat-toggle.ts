import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setChatEnabled, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { body, fail } from './_lib.js';

/** POST /api/chat-toggle { code, token, enabled } → { view }. Host turns chat on/off pre-game. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token, enabled } = body<{ code?: string; token?: string; enabled?: boolean }>(req);
    if (!code || !token || typeof enabled !== 'boolean') {
      throw new Error('code, token, and enabled are required.');
    }

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = setChatEnabled(room, { hostToken: token, enabled });
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
