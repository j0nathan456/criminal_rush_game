import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { backdrop, panelIn } from '../ui/motion';
import { TEAM_META } from '../constants/theme';
import { ROLES } from '../constants/roles';
import type { Team } from '../types/cards';

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
}

interface StatsSummary {
  total_games: number;
  avg_duration_seconds: number | null;
  team_wins: Partial<Record<Team, number>>;
  player_count_breakdown: Record<string, number>;
  role_stats: Array<{ role_id: string; team: Team; games: number; wins: number; win_rate: number }>;
}

const ROLE_NAME: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.name]));

function formatMinutes(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * A bar sized by `fraction` (0-1) — used for team split and role win rates.
 * A minimum width keeps a real-but-tiny share visually distinguishable from
 * a true zero rather than disappearing entirely.
 */
function Bar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  );
}

/**
 * Aggregate, anonymized stats across every completed online game (see
 * api/stats.ts / the completed_games tables) — fetched fresh each time the
 * panel opens rather than kept live, since this isn't data that needs to
 * react mid-session.
 */
export function StatsPanel({ open, onClose }: StatsPanelProps) {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // No separate "loading" state to set synchronously at the top of the
  // effect (see useOnlineGame's fetch effects for the same shape) — derived
  // below instead: open with neither a result nor an error yet.
  const loading = open && !stats && !error;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/stats')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
        setStats(data as StatsSummary);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const totalGames = stats?.total_games ?? 0;
  const civWins = stats?.team_wins.CIVILIAN ?? 0;
  const crimWins = stats?.team_wins.CRIMINAL ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Game stats"
          onClick={onClose}
        >
          <motion.div
            variants={panelIn}
            className="panel flex max-h-[88vh] w-full max-w-lg flex-col p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-2xl font-extrabold">📊 Game Stats</h2>
              <button type="button" className="btn btn-ghost px-3 py-1 text-lg" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {loading && <p className="text-center text-sm text-fog">Loading…</p>}
              {error && <p className="text-center text-sm text-crim">{error}</p>}

              {stats && totalGames === 0 && (
                <p className="text-center text-sm text-fog">No games completed yet — check back after a few rounds.</p>
              )}

              {stats && totalGames > 0 && (
                <>
                  <section className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-panel-2/60 p-3 text-center">
                      <div className="text-2xl font-extrabold">{totalGames}</div>
                      <div className="text-xs text-fog">Games played</div>
                    </div>
                    <div className="rounded-lg bg-panel-2/60 p-3 text-center">
                      <div className="text-2xl font-extrabold">{formatMinutes(stats.avg_duration_seconds)}</div>
                      <div className="text-xs text-fog">Avg. duration</div>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fog">Wins by team</h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span style={{ color: TEAM_META.CIVILIAN.color }}>{TEAM_META.CIVILIAN.icon} {civWins}</span>
                      <Bar fraction={civWins / totalGames} color={TEAM_META.CIVILIAN.color} />
                      <Bar fraction={crimWins / totalGames} color={TEAM_META.CRIMINAL.color} />
                      <span style={{ color: TEAM_META.CRIMINAL.color }}>{crimWins} {TEAM_META.CRIMINAL.icon}</span>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fog">Player counts</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.player_count_breakdown)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([count, games]) => (
                          <span key={count} className="chip bg-panel-2 text-chalk">
                            {count} players <span className="text-fog">· {games}</span>
                          </span>
                        ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fog">Win rate by role</h3>
                    <div className="space-y-1.5">
                      {stats.role_stats.map((r) => (
                        <div key={`${r.role_id}-${r.team}`} className="flex items-center gap-2 text-sm">
                          <span className="w-28 shrink-0 truncate" style={{ color: TEAM_META[r.team].color }}>
                            {ROLE_NAME[r.role_id] ?? r.role_id}
                          </span>
                          <Bar fraction={r.win_rate} color={TEAM_META[r.team].color} />
                          <span className="w-20 shrink-0 text-right text-xs text-fog">
                            {Math.round(r.win_rate * 100)}% ({r.games})
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
