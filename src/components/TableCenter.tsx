import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, ActionCard } from '../types/cards';
import { EvidenceGrid } from './EvidenceGrid';
import { Card } from './Card';

interface TableCenterProps {
  state: GameState;
  viewer?: Player;
  isViewersTurn: boolean;
  onPlayEvidence?: (category: EvidenceCategory) => void;
}

/** Cards remaining at/below which the deck-out reshuffle is worth flagging. */
const LOW_DECK = 5;

/** A labelled pile with a card-count badge, shared by the deck and discard. */
function Pile({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {children}
        <span className="absolute -right-2 -top-2 min-w-6 rounded-full bg-ink px-1.5 py-0.5 text-center text-xs font-extrabold text-chalk ring-1 ring-line">
          {count}
        </span>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-fog">{label}</span>
    </div>
  );
}

/** The face-up top of the discard, or a dashed empty slot when nothing's there. */
function DiscardTop({ top }: { top?: ActionCard }) {
  if (top) return <Card card={top} preview />;
  return (
    <div className="flex aspect-[5/7] w-[140px] items-center justify-center rounded-xl border border-dashed border-line text-xs text-fog/50">
      Empty
    </div>
  );
}

/**
 * The shared centre of the table: the Evidence Grid with the draw/discard piles
 * laid out parallel to it (a pile column beside the grid, stacking below only on
 * the narrowest screens).
 */
export function TableCenter({ state, viewer, isViewersTurn, onPlayEvidence }: TableCenterProps) {
  const drawCount = state.drawPile.length;
  const discardTop = state.discardPile.at(-1);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className="min-w-0 md:flex-1">
        <EvidenceGrid
          grid={state.evidenceGrid}
          onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
        />
      </div>

      <div className="flex shrink-0 flex-row items-start justify-center gap-4 md:flex-col md:justify-start">
        <Pile label={`Deck · ${drawCount}`} count={drawCount}>
          <Card faceDown />
        </Pile>
        <Pile label={`Discard · ${state.discardPile.length}`} count={state.discardPile.length}>
          <DiscardTop top={discardTop} />
        </Pile>
        {drawCount <= LOW_DECK && (
          <p className="max-w-[150px] rounded-lg bg-amber/10 px-2 py-1.5 text-center text-[11px] text-amber ring-1 ring-amber/30">
            Deck low — on run-out both teams score 1 VP and the discard reshuffles.
          </p>
        )}
      </div>
    </div>
  );
}
