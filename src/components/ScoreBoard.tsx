import type { Team } from '../types/cards';
import { TEAM_META } from '../constants/theme';

interface ScoreBoardProps {
  scores: Record<Team, number>;
  targets: Record<Team, number>;
  winner: Team | null;
}

const TEAMS: Team[] = ['CIVILIAN', 'CRIMINAL'];

/**
 * Victory-point tracks for both teams, shown as a pip row per team (rulebook
 * §2). The first team to reach its target wins; ties go to the Civilians.
 */
export function ScoreBoard({ scores, targets, winner }: ScoreBoardProps) {
  return (
    <section className="cr-score" aria-label="Score board">
      <header className="cr-panel__head">
        <h2>Score Board</h2>
        {winner && (
          <span className="cr-score__winner" style={{ color: TEAM_META[winner].color }}>
            {TEAM_META[winner].label} win!
          </span>
        )}
      </header>

      {TEAMS.map((team) => {
        const meta = TEAM_META[team];
        const target = targets[team];
        const score = scores[team];
        return (
          <div key={team} className="cr-score__row">
            <span className="cr-score__team" style={{ color: meta.color }}>
              <span aria-hidden="true">{meta.icon}</span> {meta.label}
            </span>
            <div className="cr-score__track">
              {Array.from({ length: target }, (_, i) => (
                <span
                  key={i}
                  className={`cr-pip${i < score ? ' is-on' : ''}`}
                  style={i < score ? { background: meta.color, borderColor: meta.color } : undefined}
                />
              ))}
            </div>
            <span className="cr-score__count">
              {score}/{target}
            </span>
          </div>
        );
      })}
    </section>
  );
}
