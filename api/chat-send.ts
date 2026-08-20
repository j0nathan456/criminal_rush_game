import type { VercelRequest, VercelResponse } from '@vercel/node';
import { postChatMessage, viewFor } from '../src/online/room.js';
import { getRoom, saveRoom } from './_store.js';
import { body, newToken, fail } from './_lib.js';

/** POST /api/chat-send { code, token, text } → { view }. Posts a chat message. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { code, token, text } = body<{ code?: string; token?: string; text?: string }>(req);
    if (!code || !token || !text) throw new Error('code, token, and text are required.');

    const room = await getRoom(code);
    if (!room) {
      res.status(404).json({ error: 'No room with that code.' });
      return;
    }

    const updated = postChatMessage(room, { token, text, now: Date.now(), id: newToken() });
    await saveRoom(updated);

    res.status(200).json({ view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
