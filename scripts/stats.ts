/**
 * scripts/stats.ts — print a formatted summary of completed online games,
 * pulled from the same get_stats_summary() Postgres function the (now
 * removed) in-app Stats panel used to call. Needs SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (both are Production/Preview
 * scoped, not Development — see package.json's "stats" script, which runs
 * this via `vercel env run --environment production`). Run with Node
 * (>=22 strips the TS types):
 *
 *   npm run stats
 */

import { createClient } from '@supabase/supabase-js';
import { ROLES } from '../src/constants/roles.ts';
import { TEAM_META } from '../src/constants/theme.ts';

interface StatsSummary {
  total_games: number;
  avg_duration_minutes: number | null;
  team_wins: Partial<Record<'CIVILIAN' | 'CRIMINAL', number>>;
  player_count_breakdown: Record<string, number>;
  role_stats: Array<{ role_id: string; team: 'CIVILIAN' | 'CRIMINAL'; games: number; wins: number; win_rate: number }>;
}

const ROLE_NAME: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.name]));

const BAR_WIDTH = 24;

/** A simple text progress bar: `fraction` filled with █, the rest with ░. */
function bar(fraction: number, width = BAR_WIDTH): string {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pad(label: string, width: number): string {
  return label.length >= width ? label.slice(0, width) : label + ' '.repeat(width - label.length);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
    console.error('Run this via `npm run stats` (which pulls Production env vars through the Vercel CLI).');
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data, error } = await supabase.rpc('get_stats_summary');
  if (error) {
    console.error('Failed to fetch stats:', error.message);
    process.exit(1);
  }

  const stats = data as StatsSummary;
  if (stats.total_games === 0) {
    console.log('No games completed yet — check back after a few rounds.');
    return;
  }

  const civWins = stats.team_wins.CIVILIAN ?? 0;
  const crimWins = stats.team_wins.CRIMINAL ?? 0;
  const totalWins = civWins + crimWins;

  console.log('');
  console.log('📊 Criminal Rush — Game Stats');
  console.log('─'.repeat(48));
  console.log(`Games played:    ${stats.total_games}`);
  console.log(`Avg. duration:   ${stats.avg_duration_minutes ?? '—'} min`);

  console.log('');
  console.log('Wins by team');
  const civFraction = totalWins > 0 ? civWins / totalWins : 0;
  console.log(
    `  ${TEAM_META.CIVILIAN.icon} Civilian ${bar(civFraction)} ${TEAM_META.CRIMINAL.icon} Criminal`,
  );
  console.log(`  ${civWins} (${Math.round(civFraction * 100)}%)`.padEnd(30) + `${crimWins} (${Math.round((1 - civFraction) * 100)}%)`);

  console.log('');
  console.log('Player counts');
  for (const [count, games] of Object.entries(stats.player_count_breakdown).sort(([a], [b]) => Number(a) - Number(b))) {
    console.log(`  ${count} players · ${games} game${games === 1 ? '' : 's'}`);
  }

  console.log('');
  console.log('Win rate by role');
  const nameWidth = Math.max(...stats.role_stats.map((r) => (ROLE_NAME[r.role_id] ?? r.role_id).length), 10);
  for (const r of stats.role_stats) {
    const name = ROLE_NAME[r.role_id] ?? r.role_id;
    const icon = TEAM_META[r.team].icon;
    const pct = Math.round(r.win_rate * 100);
    console.log(`  ${icon} ${pad(name, nameWidth)} ${bar(r.win_rate)} ${String(pct).padStart(3)}% (${r.games})`);
  }
  console.log('');
}

main();
