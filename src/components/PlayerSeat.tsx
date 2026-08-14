import { motion } from 'framer-motion';
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

/** A compact summary of one player at the table. Clickable when targetable. */
export function PlayerSeat({ player, active, isSelf, targetable, onClick }: PlayerSeatProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const clickable = Boolean(onClick) && targetable;

  const style: React.CSSProperties = {
    borderLeftColor: meta.color,
    background: isSelf ? meta.soft : undefined,
    boxShadow: active && !targetable ? `0 0 0 2px ${meta.color}` : undefined,
  };

  return (
    <motion.div
      whileHover={clickable ? { scale: 1.02 } : undefined}
      whileTap={clickable ? { scale: 0.98 } : undefined}
      onClick={clickable ? () => onClick!(player) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={style}
      className={`rounded-xl border border-l-4 border-line bg-panel-2/70 p-2.5 transition
        ${targetable ? 'cursor-pointer ring-2 ring-amber hover:bg-amber/10' : ''}`}
    >
      <div className="flex items-center gap-1.5 font-bold">
        <span aria-hidden="true">{meta.icon}</span>
        <span className="truncate">
          {player.name}
          {isSelf ? ' (you)' : ''}
        </span>
      </div>
      <div className="text-[13px] text-fog">{player.role.name}</div>
      <div className="mt-1.5 flex gap-3 text-[13px] tabular-nums">
        <span title="Money">💵 {player.money}</span>
        <span title="Power level">💪 {player.powerLevel}</span>
        <span title="Cards in hand">🂠 {player.hand.length}</span>
      </div>
      {statuses.length > 0 && (
        <div className="mt-1.5 flex gap-1.5">
          {statuses.map((key) => (
            <span key={key} title={STATUS_META[key].label} aria-hidden="true">
              {STATUS_META[key].icon}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
