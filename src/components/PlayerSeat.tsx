import type { Player } from '../types/game';
import { TEAM_META, STATUS_META } from '../constants/theme';

interface PlayerSeatProps {
  player: Player;
  active?: boolean;
  /** True for the seat belonging to the local player ("you"). */
  isSelf?: boolean;
  /** When true, the seat is a selectable target (attack/expose). */
  targetable?: boolean;
  onClick?: (player: Player) => void;
}

type StatusKey = keyof typeof STATUS_META;

/**
 * A compact summary of one player at the table: role, team, money, hand size,
 * and any status tokens. Used for the seats around the board.
 */
export function PlayerSeat({ player, active, isSelf, targetable, onClick }: PlayerSeatProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const clickable = Boolean(onClick) && targetable;

  return (
    <div
      className={`cr-seat${active ? ' is-active' : ''}${isSelf ? ' is-self' : ''}${targetable ? ' is-targetable' : ''}`}
      style={{ '--team-color': meta.color, '--team-soft': meta.soft } as React.CSSProperties}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onClick!(player) : undefined}
    >
      <div className="cr-seat__top">
        <span className="cr-seat__team" aria-hidden="true">{meta.icon}</span>
        <span className="cr-seat__name">{player.name}{isSelf ? ' (you)' : ''}</span>
      </div>
      <div className="cr-seat__role">{player.role.name}</div>
      <div className="cr-seat__stats">
        <span title="Money">💵 {player.money}</span>
        <span title="Power level">💪 {player.powerLevel}</span>
        <span title="Cards in hand">🂠 {player.hand.length}</span>
      </div>
      {statuses.length > 0 && (
        <div className="cr-seat__status">
          {statuses.map((key) => (
            <span key={key} title={STATUS_META[key].label} aria-hidden="true">
              {STATUS_META[key].icon}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
