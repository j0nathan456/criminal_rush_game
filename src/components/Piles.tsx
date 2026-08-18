import type { ActionCard } from '../types/cards';
import { Card } from './Card';

interface PilesProps {
  drawPile: ActionCard[];
  discardPile: ActionCard[];
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

/** The draw and discard piles, as a panel that sits parallel to the Evidence Grid. */
export function Piles({ drawPile, discardPile }: PilesProps) {
  const drawCount = drawPile.length;
  const discardTop = discardPile.at(-1);

  return (
    <section className="panel" aria-label="Draw and discard piles">
      <header className="panel-head">
        <h2 className="panel-title">Piles</h2>
        <span className="text-xs text-fog">draw · discard</span>
      </header>
      <div className="flex items-start justify-center gap-6">
        <Pile label={`Deck · ${drawCount}`} count={drawCount}>
          <Card faceDown />
        </Pile>
        <Pile label={`Discard · ${discardPile.length}`} count={discardPile.length}>
          <DiscardTop top={discardTop} />
        </Pile>
      </div>
      {drawCount <= LOW_DECK && (
        <p className="mt-3 rounded-lg bg-amber/10 px-3 py-1.5 text-center text-[11px] text-amber ring-1 ring-amber/30">
          Deck low — when it runs out, both teams score 1 VP and the discard reshuffles.
        </p>
      )}
    </section>
  );
}
