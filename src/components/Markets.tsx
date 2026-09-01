import type { GameState, Player } from '../types/game';
import type { AnyCard } from '../types/cards';
import { MAX_WEAPONS } from '../engine';
import { Market } from './Market';

interface MarketsProps {
  state: GameState;
  viewer?: Player;
  isViewersTurn: boolean;
  onBuy?: (card: AnyCard) => void;
}

/**
 * The two shops shown side by side as the central board content: the public
 * Market and the Black Market. The Black Market is always visible; only
 * Criminals on their own turn can buy from it.
 */
export function Markets({ state, viewer, isViewersTurn, onBuy }: MarketsProps) {
  const isCriminal = viewer?.team === 'CRIMINAL';
  const canBuyBlackMarket = isViewersTurn && isCriminal;
  const weaponCapReached = (viewer?.inventory.filter((c) => c.type === 'WEAPON').length ?? 0) >= MAX_WEAPONS;

  return (
    <div className="flex h-full flex-col gap-4">
      <Market
        title="Market"
        subtitle="5 cards · open to all"
        cards={state.publicMarket}
        affordableUpTo={viewer?.money}
        weaponCapReached={weaponCapReached}
        onBuy={isViewersTurn ? onBuy : undefined}
        variant="public"
      />
      <Market
        title="Black Market"
        subtitle={isCriminal ? 'Criminals only · buy to Expand Network' : 'Criminals only · you can observe'}
        cards={state.blackMarket}
        affordableUpTo={canBuyBlackMarket ? viewer?.money : undefined}
        weaponCapReached={weaponCapReached}
        onBuy={canBuyBlackMarket ? onBuy : undefined}
        variant="black"
      />
    </div>
  );
}
