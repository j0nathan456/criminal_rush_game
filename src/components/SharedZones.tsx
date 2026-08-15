import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, AnyCard } from '../types/cards';
import { TableCenter } from './TableCenter';
import { MarketShelf } from './MarketShelf';

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
 * The zones shared by every player, stacked for the narrow-screen fallback: the
 * table centre (piles + Evidence Grid) and the collapsible Market shelf (open by
 * default here since there's no room to float it). The wide-screen layout places
 * these separately (TableCenter in the oval, MarketShelf as a drawer).
 */
export function SharedZones({ state, viewer, isViewersTurn, onPlayEvidence, onBuy }: SharedZonesProps) {
  return (
    <div className="flex flex-col gap-4">
      <TableCenter state={state} viewer={viewer} isViewersTurn={isViewersTurn} onPlayEvidence={onPlayEvidence} />
      <MarketShelf state={state} viewer={viewer} isViewersTurn={isViewersTurn} onBuy={onBuy} defaultOpen />
    </div>
  );
}
