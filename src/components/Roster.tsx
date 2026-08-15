import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '../types/game';
import { PlayerSeat } from './PlayerSeat';

interface RosterProps {
  players: Player[];
  currentPlayerIndex: number;
  viewerIndex: number;
  /** True while the board is asking the viewer to pick a target. */
  targeting: boolean;
  isTargetable: (player: Player) => boolean;
  onSelectTarget?: (playerId: string) => void;
  /** Whether the roster starts expanded. */
  defaultOpen?: boolean;
}

/**
 * A single "Players" button that reveals every player and the role they hold.
 * Each entry is a PlayerSeat (click for full detail). While the board is asking
 * for a target the roster force-opens and its entries become the target picker.
 */
export function Roster({ players, currentPlayerIndex, viewerIndex, targeting, isTargetable, onSelectTarget, defaultOpen = false }: RosterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const show = open || targeting;

  return (
    <section className="panel !p-0" aria-label="Players">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={show}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="panel-title">👥 Players · Roles</span>
        <span className="flex items-center gap-2 text-xs text-fog">
          {players.length}
          <span aria-hidden="true">{show ? '▾' : '▸'}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-3 pb-3">
              {targeting && (
                <p className="rounded-lg bg-amber/10 px-2.5 py-1.5 text-center text-xs text-amber ring-1 ring-amber/30">
                  Pick a highlighted player.
                </p>
              )}
              {players.map((p, i) => (
                <PlayerSeat
                  key={p.id}
                  player={p}
                  active={i === currentPlayerIndex}
                  isSelf={i === viewerIndex}
                  targetable={isTargetable(p)}
                  onClick={targeting ? (pl) => onSelectTarget?.(pl.id) : undefined}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
