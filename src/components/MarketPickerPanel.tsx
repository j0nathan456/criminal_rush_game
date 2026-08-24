import { useState } from 'react';
import type { GameState } from '../types/game';
import type { AnyCard, MarketCard } from '../types/cards';
import { TEAM_META } from '../constants/theme';

export interface MarketPickerPanelProps {
  state: GameState;
  viewerIndex: number;
  onBuy?: (card: AnyCard) => void;
  onCancel?: () => void;
}

/**
 * The "Buy" action's picker, opened instead of buying by clicking a card
 * directly in the Market/Black Market — the Action box is the one place that
 * spends the turn's AP, so purchasing goes through it like every other
 * action. Civilians go straight to the 5 public Market cards; Criminals pick
 * Market or Black Market first, since only they can see/buy the latter.
 * Buying Coffee Machine doesn't need any special handling here — who gets
 * the token is asked as a separate follow-up step (see
 * pendingCoffeeRecipient/CoffeeRecipientPanel) after the purchase commits.
 */
export function MarketPickerPanel({ state, viewerIndex, onBuy, onCancel }: MarketPickerPanelProps) {
  const viewer = state.players[viewerIndex];
  const isCriminal = viewer?.team === 'CRIMINAL';
  const [source, setSource] = useState<'public' | 'black' | null>(isCriminal ? null : 'public');

  if (!viewer) return null;

  if (source === null) {
    return (
      <section className="cr-role" aria-label="Buy from a Market">
        <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
          <h2>🛒 Buy</h2>
        </header>
        <p className="cr-role__desc">Which Market?</p>
        <div className="cr-role__chips">
          <button type="button" className="cr-role__chip" onClick={() => setSource('public')}>Market</button>
          <button type="button" className="cr-role__chip" onClick={() => setSource('black')}>Black Market</button>
        </div>
        <div className="cr-role__actions">
          <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    );
  }

  // Expand Network has its own dedicated Action button (see ActionBar) —
  // buying it here would incorrectly cost the once-per-turn Buy too.
  const cards: MarketCard[] = source === 'black'
    ? state.blackMarket.filter((c) => c.type !== 'SPECIAL')
    : state.publicMarket;
  const title = source === 'black' ? 'Black Market' : 'Market';

  // Weakened Network (rulebook p.16): a captured Criminal pays $1 more for
  // Expand Network — mirrors doPurchase's own surcharge, so the button
  // always shows what buying will actually cost. Only what the viewer can
  // actually afford is offered here — an unaffordable card is a dead end,
  // not a choice.
  const affordable = cards
    .map((c) => ({ card: c, cost: c.cost + (c.type === 'SPECIAL' && viewer.isCaptured ? 1 : 0) }))
    .filter(({ cost }) => cost <= viewer.money);

  return (
    <section className="cr-role" aria-label="Buy from a Market">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🛒 Buy from the {title}</h2>
      </header>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {affordable.length === 0 && (
            <span className="cr-role__empty">
              {cards.length === 0 ? 'Nothing available.' : "You can't afford anything here."}
            </span>
          )}
          {affordable.map(({ card: c, cost }) => (
            <button
              key={c.id}
              type="button"
              className="cr-role__chip"
              title={`${c.name} — ${c.description}`}
              onClick={() => onBuy?.(c)}
            >
              {c.name} (${cost})
            </button>
          ))}
        </div>
      </div>
      <div className="cr-role__actions">
        {isCriminal && (
          <button type="button" className="cr-role__cancel" onClick={() => setSource(null)}>Back</button>
        )}
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
