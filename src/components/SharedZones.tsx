import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, AnyCard } from '../types/cards';
import { EvidenceGrid } from './EvidenceGrid';
import { Market } from './Market';

interface SharedZonesProps {
  state: GameState;
  /** The local player, used for affordability and evidence placement. */
  viewer?: Player;
  /** Whether it is the viewer's turn (gates evidence placement and buying). */
  isViewersTurn: boolean;
  onPlayEvidence?: (category: EvidenceCategory) => void;
  onBuy?: (card: AnyCard) => void;
}

/**
 * The zones shared by every player: the Evidence Grid, the public Market, and
 * the Black Market (always visible; only Criminals on their turn can buy).
 * Rendered in the centre of the table on wide screens and stacked in the
 * mobile fallback.
 */
export function SharedZones({ state, viewer, isViewersTurn, onPlayEvidence, onBuy }: SharedZonesProps) {
  const isCriminal = viewer?.team === 'CRIMINAL';
  // Criminals may buy from the Black Market on their own turn; everyone else
  // (and Criminals off-turn) can only observe what's available.
  const canBuyBlackMarket = isViewersTurn && isCriminal;

  return (
    <div className="flex flex-col gap-4">
      <EvidenceGrid
        grid={state.evidenceGrid}
        onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
      />
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
  );
}
