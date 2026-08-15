import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, Player } from '../types/game';
import type { AnyCard } from '../types/cards';
import { Market } from './Market';

interface MarketShelfProps {
  state: GameState;
  viewer?: Player;
  isViewersTurn: boolean;
  onBuy?: (card: AnyCard) => void;
  /** Whether the shelf starts expanded (mobile stack) or collapsed (desktop). */
  defaultOpen?: boolean;
}

/**
 * The two shops (public Market + Black Market) in one collapsible shelf, so the
 * board can own the screen and the markets open only when the player is buying.
 * The Black Market is always visible; only Criminals on their own turn can buy.
 */
export function MarketShelf({ state, viewer, isViewersTurn, onBuy, defaultOpen = false }: MarketShelfProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isCriminal = viewer?.team === 'CRIMINAL';
  const canBuyBlackMarket = isViewersTurn && isCriminal;

  return (
    <section className="panel !p-0" aria-label="Markets">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <span className="panel-title">🛒 Markets</span>
        <span className="flex items-center gap-2 text-xs text-fog">
          {state.publicMarket.length + state.blackMarket.length} cards
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 px-4 pb-4">
              <Market
                title="Market"
                subtitle="5 cards · open to all"
                cards={state.publicMarket}
                affordableUpTo={viewer?.money}
                onBuy={isViewersTurn ? onBuy : undefined}
                variant="public"
              />
              <Market
                title="Black Market"
                subtitle={isCriminal ? 'Criminals only · buy to Expand Network' : 'Criminals only · you can observe'}
                cards={state.blackMarket}
                affordableUpTo={canBuyBlackMarket ? viewer?.money : undefined}
                onBuy={canBuyBlackMarket ? onBuy : undefined}
                variant="black"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
