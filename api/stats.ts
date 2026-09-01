import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fail } from './_lib.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;

export interface StatsSummary {
  total_games: number;
  avg_duration_seconds: number | null;
  team_wins: Partial<Record<'CIVILIAN' | 'CRIMINAL', number>>;
  player_count_breakdown: Record<string, number>;
  role_stats: Array<{ role_id: string; team: 'CIVILIAN' | 'CRIMINAL'; games: number; wins: number; win_rate: number }>;
}

/** GET /api/stats → StatsSummary. Aggregate, anonymized — no auth needed. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    if (!supabase) {
      res.status(503).json({ error: 'Stats are not configured for this deployment.' });
      return;
    }
    const { data, error } = await supabase.rpc('get_stats_summary');
    if (error) throw new Error(error.message);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data as StatsSummary);
  } catch (err) {
    fail(res, err);
  }
}
