import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface MarketDiscountPanelProps {
  state: GameState;
  viewerIndex: number;
  amount: number;
  onBuy?: (cardId: string) => void;
  onSkip?: () => void;
}

/**
 * Spring Cleaning's follow-up: the Market has just been discarded-and-refilled
 * (see pendingMarketDiscount), and the player may buy one card from it at a
 * discount, or skip. Not blocking — the player can take other actions first
 * and come back, but it's forfeit at end of turn if left unused.
 */
export function MarketDiscountPanel({ state, viewerIndex, amount, onBuy, onSkip }: MarketDiscountPanelProps) {
  const viewer = state.players[viewerIndex];
  if (!viewer) return null;

  return (
    <section className="cr-role" aria-label="Market discount">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🧹 Spring Cleaning discount</h2>
      </header>
      <p className="cr-role__desc">You may buy one Market card for ${amount} off, or skip.</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {state.publicMarket.length === 0 && <span className="cr-role__empty">The Market is empty.</span>}
          {state.publicMarket.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cr-role__chip"
              onClick={() => onBuy?.(c.id)}
            >
              {c.name} (${Math.max(0, c.cost - amount)})
            </button>
          ))}
        </div>
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={onSkip}>Skip</button>
      </div>
    </section>
  );
}
