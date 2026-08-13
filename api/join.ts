import type { VercelRequest, VercelResponse } from '@vercel/node';
import { joinRoom, viewFor } from '../src/online/room';
import { getRoom, saveRoom } from './_store';
import { body, newToken, fail } from './_lib';

/** POST /api/join { code, name } → { token, view }. Joins an existing room. */
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
    const updated = joinRoom(room, token, (name ?? '').trim());
    await saveRoom(updated);

    res.status(200).json({ token, view: viewFor(updated, token) });
  } catch (err) {
    fail(res, err);
  }
}
