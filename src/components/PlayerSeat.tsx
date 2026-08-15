import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '../types/game';
import { TEAM_META, STATUS_META } from '../constants/theme';
import { TeamIcon } from './TeamIcon';
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

/**
 * A compact seat button. It shows only identity + at-a-glance status; clicking
 * it (when not being used to pick a target) opens a popover with the player's
 * full detail — money, PL, hand size, statuses, tokens, and inventory.
 */
export function PlayerSeat({ player, active, isSelf, isNeighbor, targetable, onClick }: PlayerSeatProps) {
  const [open, setOpen] = useState(false);
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const tokens = playerTokens(player);
  const selectsTarget = Boolean(onClick) && targetable;
  // The active-player highlight wins; a quieter dashed accent marks neighbours.
  const showNeighbor = isNeighbor && !active && !targetable;

  const handleClick = () => {
    if (selectsTarget) onClick!(player);
    else setOpen((o) => !o);
  };

  const style: React.CSSProperties = {
    borderLeftColor: meta.color,
    background: isSelf ? meta.soft : undefined,
    boxShadow: active && !targetable ? `0 0 0 2px ${meta.color}` : undefined,
  };

  const weapons = player.inventory.filter((c) => c.type === 'WEAPON');
  const perks = player.inventory.filter((c) => c.type !== 'WEAPON');

  return (
    <div className="relative">
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        aria-expanded={selectsTarget ? undefined : open}
        title={selectsTarget ? `Select ${player.name}` : `${player.name} — details`}
        style={style}
        className={`flex w-full items-center gap-2 rounded-xl border border-l-4 border-line bg-panel-2/70 p-2 text-left transition
          ${targetable ? 'cursor-pointer ring-2 ring-amber hover:bg-amber/10' : 'cursor-pointer hover:border-amber/50'}
          ${active && !targetable ? 'animate-turn-pulse' : ''}
          ${showNeighbor ? 'ring-1 ring-dashed ring-fog/50' : ''}`}
      >
        <TeamIcon team={player.team} className="h-8 w-8 shrink-0 rounded-md object-cover" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 font-bold">
            <span className="truncate">
              {player.name}
              {isSelf ? ' (you)' : ''}
            </span>
            {isNeighbor && (
              <span className="shrink-0 text-[11px]" title="Neighbour — combat & trade range">⚔️🤝</span>
            )}
          </span>
          <span className="block truncate text-[12px] text-fog">{player.role.name}</span>
        </span>
        {statuses.length > 0 && (
          <span className="flex shrink-0 gap-0.5 text-[13px]" aria-hidden="true">
            {statuses.map((key) => (
              <span key={key} title={STATUS_META[key].label}>{STATUS_META[key].icon}</span>
            ))}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && !selectsTarget && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{ borderLeftColor: meta.color }}
              className="absolute left-0 top-full z-50 mt-1 w-60 rounded-xl border border-l-4 border-line bg-panel p-3 shadow-noir"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-extrabold" style={{ color: meta.color }}>{player.name}</span>
                <span className="flex items-center gap-1 text-[12px] text-fog">
                  <TeamIcon team={player.team} className="h-4 w-4 shrink-0 rounded-full object-cover" /> {meta.label}
                </span>
              </div>
              <div className="text-[12px] text-fog">{player.role.name} · Base PL {player.role.powerlevel}</div>

              <div className="mt-2 flex gap-3 text-sm tabular-nums">
                <span title="Money">💵 {player.money}</span>
                <span title="Power level">💪 {player.powerLevel} PL</span>
                <span title="Cards in hand">🂠 {player.hand.length}</span>
              </div>

              {(statuses.length > 0 || tokens.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {statuses.map((key) => (
                    <span key={key} className="chip text-white" style={{ background: STATUS_META[key].color }}>
                      {STATUS_META[key].icon} {STATUS_META[key].label}
                    </span>
                  ))}
                  {tokens.map((t) => (
                    <span key={t.key} title={t.hint} className="chip text-white" style={{ background: t.color }}>
                      {t.icon} {t.label}{t.count && t.count > 1 ? ` ×${t.count}` : ''}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 border-t border-line/60 pt-2 text-[12px]">
                <div className="text-fog">
                  <span className="font-semibold text-chalk">Perks ({perks.length})</span>
                  {perks.length > 0 ? ` · ${perks.map((p) => p.name).join(', ')}` : ' · none'}
                </div>
                <div className="mt-1 text-fog">
                  <span className="font-semibold text-chalk">Weapons ({weapons.length})</span>
                  {weapons.length > 0 ? ` · ${weapons.map((w) => w.name).join(', ')}` : ' · none'}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
