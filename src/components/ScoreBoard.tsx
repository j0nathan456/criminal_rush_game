import { motion } from 'framer-motion';
import type { Team } from '../types/cards';
import { TEAM_META } from '../constants/theme';
import { spring } from '../ui/motion';

interface ScoreBoardProps {
  scores: Record<Team, number>;
  targets: Record<Team, number>;
  winner: Team | null;
}

const TEAMS: Team[] = ['CIVILIAN', 'CRIMINAL'];

/**
 * Victory-point tracks for both teams. First to its target wins; ties go to
 * the Civilians. Filled pips pop in as scores rise.
 */
export function ScoreBoard({ scores, targets, winner }: ScoreBoardProps) {
  return (
    <section className="panel" aria-label="Score board">
      <header className="panel-head">
        <h2 className="panel-title">Score Board</h2>
        {winner && (
          <span className="text-sm font-extrabold" style={{ color: TEAM_META[winner].color }}>
            {TEAM_META[winner].label} win!
          </span>
        )}
      </header>

      <div className="flex flex-col gap-3">
        {TEAMS.map((team) => {
          const meta = TEAM_META[team];
          const target = targets[team];
          const score = scores[team];
          return (
            <div key={team} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: meta.color }}>
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                <span className="text-xs tabular-nums text-fog">
                  {score}/{target}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: target }, (_, i) => {
                  const on = i < score;
                  return (
                    <motion.span
                      key={i}
                      initial={false}
                      animate={on ? { scale: [1, 1.35, 1] } : {}}
                      transition={spring}
                      className="h-4 w-4 rounded-full border-2"
                      style={
                        on
                          ? { background: meta.color, borderColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }
                          : { borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
