import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, AnyCard, ActionCard } from '../types/cards';
import { EvidenceGrid } from './EvidenceGrid';
import { Market } from './Market';
import { Card } from './Card';

interface SharedZonesProps {
  state: GameState;
  /** The local player, used for affordability and evidence placement. */
  viewer?: Player;
  /** Whether it is the viewer's turn (gates evidence placement and buying). */
  isViewersTurn: boolean;
  onPlayEvidence?: (category: EvidenceCategory) => void;
  onBuy?: (card: AnyCard) => void;
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
  if (top) return <Card card={top} />;
  return (
    <div className="flex aspect-[5/7] w-[140px] items-center justify-center rounded-xl border border-dashed border-line text-xs text-fog/50">
      Empty
    </div>
  );
}

/**
 * The zones shared by every player: the draw/discard piles, the Evidence Grid,
 * the public Market, and the Black Market (always visible; only Criminals on
 * their turn can buy). Rendered in the centre of the table on wide screens and
 * stacked in the mobile fallback.
 */
export function SharedZones({ state, viewer, isViewersTurn, onPlayEvidence, onBuy }: SharedZonesProps) {
  const isCriminal = viewer?.team === 'CRIMINAL';
  // Criminals may buy from the Black Market on their own turn; everyone else
  // (and Criminals off-turn) can only observe what's available.
  const canBuyBlackMarket = isViewersTurn && isCriminal;
  const drawCount = state.drawPile.length;
  const discardTop = state.discardPile.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <section className="panel" aria-label="Draw and discard piles">
        <header className="panel-head">
          <h2 className="panel-title">Piles</h2>
          <span className="text-xs text-fog">draw · discard</span>
        </header>
        <div className="flex flex-wrap items-start justify-center gap-8">
          <Pile label={`Deck · ${drawCount}`} count={drawCount}>
            <Card faceDown />
          </Pile>
          <Pile label={`Discard · ${state.discardPile.length}`} count={state.discardPile.length}>
            <DiscardTop top={discardTop} />
          </Pile>
        </div>
        {drawCount <= LOW_DECK && (
          <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-center text-xs text-amber ring-1 ring-amber/30">
            Deck running low — when it runs out, both teams score 1 VP and the discard reshuffles in.
          </p>
        )}
      </section>

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
