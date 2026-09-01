/**
 * api/_stats.ts
 *
 * Anonymized completed-game stats for online play (server-only; the leading
 * underscore keeps it off the route table). Writes go straight to Postgres
 * via the Supabase service_role key — never exposed to the browser bundle.
 * No-ops when Supabase isn't configured (e.g. local `vercel dev` without the
 * env vars pulled), same fallback shape as _store.ts's Redis-or-memory split.
 */

import { createClient } from '@supabase/supabase-js';
import type { Room } from '../src/online/protocol.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;

/**
 * Record a finished online game: player count, winning team, duration, and
 * an anonymized per-player role/team breakdown (see completed_game_players —
 * no names or seat-to-identity mapping, by design). Best-effort: a failure
 * here is logged, never thrown, so a stats hiccup can't break the actual
 * game action the player is waiting on (see action.ts's call site).
 */
export async function recordCompletedGame(room: Room): Promise<void> {
  if (!supabase || !room.state?.winner) return;
  const startedAt = room.startedAt ?? room.createdAt;

  const { data: game, error } = await supabase
    .from('completed_games')
    .insert({
      room_code: room.code,
      player_count: room.state.players.length,
      winning_team: room.state.winner,
      started_at: new Date(startedAt).toISOString(),
    })
    .select('id')
    .single();
  if (error || !game) {
    console.error('Failed to record completed game', error);
    return;
  }

  // `seat` here is the player's index in state.players — turn order, not
  // lobby join order (see protocol.ts's own note on the two diverging) —
  // kept in case turn position ever turns out to correlate with winning.
  const winner = room.state.winner;
  const players = room.state.players.map((p, seat) => ({
    game_id: game.id as string,
    seat,
    team: p.team,
    role_id: p.role.id,
    won: p.team === winner,
  }));
  const { error: playersError } = await supabase.from('completed_game_players').insert(players);
  if (playersError) console.error('Failed to record completed game players', playersError);
}
