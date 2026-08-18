import type { ActionCard } from '../types/cards';
import { Card } from './Card';

export interface SpyPeekProps {
  card: ActionCard;
}

/**
 * The Spy's Recon: the true top card of the deck, visible only to the Spy on
 * their own turn (see `lastPeek` in reducer.ts). Placed right below the Hand
 * and beside the action buttons — rather than off by the deck itself — so
 * it's visible exactly when deciding whether to spend an action on Draw.
 */
export function SpyPeek({ card }: SpyPeekProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 self-start rounded-lg bg-amber/10 p-2 ring-1 ring-amber/30">
      <Card card={card} preview />
      <span className="text-[11px] font-bold uppercase tracking-wide text-amber">🔎 Recon — top of deck</span>
    </div>
  );
}
