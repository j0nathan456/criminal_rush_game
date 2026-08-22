import { useState } from 'react';
import type { GameState } from '../types/game';
import type { AnyCard, MarketCard } from '../types/cards';
import { TEAM_META } from '../constants/theme';

export interface MarketPickerPanelProps {
  state: GameState;
  viewerIndex: number;
  onBuy?: (card: AnyCard, coffeeRecipientId?: string) => void;
  onCancel?: () => void;
}

/**
 * The "Buy" action's picker, opened instead of buying by clicking a card
 * directly in the Market/Black Market — the Action box is the one place that
 * spends the turn's AP, so purchasing goes through it like every other
 * action. Civilians go straight to the 5 public Market cards; Criminals pick
 * Market or Black Market first, since only they can see/buy the latter.
 */
export function MarketPickerPanel({ state, viewerIndex, onBuy, onCancel }: MarketPickerPanelProps) {
  const viewer = state.players[viewerIndex];
  const isCriminal = viewer?.team === 'CRIMINAL';
  const [source, setSource] = useState<'public' | 'black' | null>(isCriminal ? null : 'public');
  const [pendingCoffee, setPendingCoffee] = useState<MarketCard | null>(null);
  const [coffeeRecipientId, setCoffeeRecipientId] = useState<string | undefined>();

  if (!viewer) return null;

  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);

  if (pendingCoffee) {
    const recipientId = coffeeRecipientId ?? viewer.id;
    return (
      <section className="cr-role" aria-label="Buy from a Market">
        <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
          <h2>☕ {pendingCoffee.name}</h2>
        </header>
        <p className="cr-role__desc">Give the Coffee token to:</p>
        <div className="cr-role__chips">
          <button
            type="button"
            className={`cr-role__chip${recipientId === viewer.id ? ' is-selected' : ''}`}
            onClick={() => setCoffeeRecipientId(viewer.id)}
          >
            {viewer.name} (you)
          </button>
          {teammates.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`cr-role__chip${recipientId === p.id ? ' is-selected' : ''}`}
              onClick={() => setCoffeeRecipientId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="cr-role__actions">
          <button
            type="button"
            className="cr-role__use"
            onClick={() => onBuy?.(pendingCoffee, recipientId)}
          >
            Buy (${pendingCoffee.cost})
          </button>
          <button type="button" className="cr-role__cancel" onClick={() => { setPendingCoffee(null); setCoffeeRecipientId(undefined); }}>
            Back
          </button>
        </div>
      </section>
    );
  }

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

  const cards: MarketCard[] = source === 'black' ? state.blackMarket : state.publicMarket;
  const title = source === 'black' ? 'Black Market' : 'Market';

  return (
    <section className="cr-role" aria-label="Buy from a Market">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🛒 Buy from the {title}</h2>
      </header>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {cards.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
          {cards.map((c) => {
            // Weakened Network (rulebook p.16): a captured Criminal pays $1
            // more for Expand Network — mirrors doPurchase's own surcharge,
            // so the button always shows what buying will actually cost.
            const surcharge = c.type === 'SPECIAL' && viewer.isCaptured ? 1 : 0;
            const cost = c.cost + surcharge;
            return (
              <button
                key={c.id}
                type="button"
                className="cr-role__chip"
                disabled={cost > viewer.money}
                title={cost > viewer.money ? `${c.name} — you can't afford this ($${cost}).` : `${c.name} — ${c.description}`}
                onClick={() => (c.name === 'Coffee Machine' ? setPendingCoffee(c) : onBuy?.(c))}
              >
                {c.name} (${cost})
              </button>
            );
          })}
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
