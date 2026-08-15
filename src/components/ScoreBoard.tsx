import { motion } from 'framer-motion';
import type { Team } from '../types/cards';
import { TEAM_META } from '../constants/theme';
import { TeamIcon } from './TeamIcon';
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
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: meta.color }}>
                  <TeamIcon team={team} className="h-5 w-5 shrink-0 rounded-full object-cover" /> {meta.label}
                </span>
                <span className="tabular-nums">
                  <span className="text-base font-extrabold" style={{ color: meta.color }}>{score} VP</span>
                  <span className="ml-1.5 text-xs text-fog">goal: {target}</span>
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

      <p className="mt-3 flex items-center gap-1.5 border-t border-line/60 pt-2 text-[11px] text-fog">
        <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: 'var(--color-line)', background: 'var(--color-panel-2)' }} />
        <span className="h-3 w-3 rounded-full border-2 border-amber bg-amber" />
        each dot = 1 VP toward that team's goal
      </p>
    </section>
  );
}
