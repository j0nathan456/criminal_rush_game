import { motion } from 'framer-motion';
import type { Player } from '../types/game';
import { TEAM_META, STATUS_META } from '../constants/theme';
import { playerTokens } from './playerTokens';

interface PlayerSeatProps {
  player: Player;
  active?: boolean;
  /** True for the seat belonging to the local player ("you"). */
  isSelf?: boolean;
  /** True for the two seats seated directly beside the viewer (combat/trade range). */
  isNeighbor?: boolean;
  /** When true, the seat is a selectable target (attack/expose). */
  targetable?: boolean;
  onClick?: (player: Player) => void;
}

type StatusKey = keyof typeof STATUS_META;

/** A compact summary of one player at the table. Clickable when targetable. */
export function PlayerSeat({ player, active, isSelf, isNeighbor, targetable, onClick }: PlayerSeatProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const tokens = playerTokens(player);
  const clickable = Boolean(onClick) && targetable;
  // The active-player highlight wins; a quieter dashed accent marks neighbours.
  const showNeighbor = isNeighbor && !active && !targetable;

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
        ${targetable ? 'cursor-pointer ring-2 ring-amber hover:bg-amber/10' : ''}
        ${showNeighbor ? 'ring-1 ring-dashed ring-fog/50' : ''}`}
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
      {(statuses.length > 0 || tokens.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[13px]">
          {statuses.map((key) => (
            <span key={key} title={STATUS_META[key].label}>
              {STATUS_META[key].icon}
            </span>
          ))}
          {tokens.map((t) => (
            <span key={t.key} title={t.count && t.count > 1 ? `${t.label} ×${t.count} — ${t.hint}` : `${t.label} — ${t.hint}`}>
              {t.icon}
              {t.count && t.count > 1 ? <span className="text-fog">×{t.count}</span> : ''}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
