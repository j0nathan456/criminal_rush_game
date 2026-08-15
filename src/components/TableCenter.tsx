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
 * The shared centre of the table: the draw/discard piles and the Evidence Grid.
 * Sized to fill its container with no internal scroll — it is the dominant
 * element of the board. Markets live in a separate collapsible shelf.
 */
export function TableCenter({ state, viewer, isViewersTurn, onPlayEvidence }: TableCenterProps) {
  const drawCount = state.drawPile.length;
  const discardTop = state.discardPile.at(-1);

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-4">
      <div className="flex items-start justify-center gap-10">
        <Pile label={`Deck · ${drawCount}`} count={drawCount}>
          <Card faceDown />
        </Pile>
        <Pile label={`Discard · ${state.discardPile.length}`} count={state.discardPile.length}>
          <DiscardTop top={discardTop} />
        </Pile>
      </div>

      {drawCount <= LOW_DECK && (
        <p className="rounded-lg bg-amber/10 px-3 py-1.5 text-center text-xs text-amber ring-1 ring-amber/30">
          Deck low — when it runs out, both teams score 1 VP and the discard reshuffles.
        </p>
      )}

      <div className="w-full max-w-3xl flex-1">
        <EvidenceGrid
          grid={state.evidenceGrid}
          onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
        />
      </div>
    </div>
  );
}
