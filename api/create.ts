import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRoom, generateCode, viewFor } from '../src/online/room';
import { getRoom, saveRoom } from './_store';
import { body, newToken, fail } from './_lib';

/** POST /api/create { name } → { code, token, view }. Creates a new room. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { name } = body<{ name?: string }>(req);
    const hostName = (name ?? '').trim() || 'Host';

    // Allocate a code that isn't already in use.
    let code = generateCode();
    for (let i = 0; i < 5 && (await getRoom(code)); i++) code = generateCode();
    if (await getRoom(code)) throw new Error('Could not allocate a room code. Please retry.');

    const hostToken = newToken();
    const room = createRoom({ code, hostToken, hostName, now: Date.now() });
    await saveRoom(room);

    res.status(200).json({ code, token: hostToken, view: viewFor(room, hostToken) });
  } catch (err) {
    fail(res, err);
  }
}
