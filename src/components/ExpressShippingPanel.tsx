import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface ExpressShippingPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (mode: 'MONEY' | 'DRAW') => void;
}

/**
 * Express Shipping's payout: once a Trade its owner initiated fully
 * resolves, they choose $1 or a card draw — never both, never automatic.
 * Always the current player (it only pays out on your own turn's Trade
 * action — see resolveTradeReturn), but still gated to `pendingExpressShipping`
 * rather than assumed, so a pass-and-play viewer looking at someone else's
 * screen sees a read-only notice instead.
 */
export function ExpressShippingPanel({ state, viewerIndex, onResolve }: ExpressShippingPanelProps) {
  const pending = state.pendingExpressShipping;
  if (!pending) return null;

  const player = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!player) return null;

  if (viewer?.id !== player.id) {
    return (
      <section className="cr-role" aria-label="Express Shipping">
        <header className="cr-role__head" style={{ color: TEAM_META[player.team].color }}>
          <h2>🚚 Express Shipping</h2>
        </header>
        <p className="cr-role__desc">Waiting for {player.name} to choose $1 or a card draw.</p>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Express Shipping">
      <header className="cr-role__head" style={{ color: TEAM_META[player.team].color }}>
        <h2>🚚 Express Shipping</h2>
      </header>
      <p className="cr-role__desc">Choose your payout:</p>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__use" onClick={() => onResolve?.('MONEY')}>
          Gain $1
        </button>
        <button type="button" className="cr-role__use" onClick={() => onResolve?.('DRAW')}>
          Draw a card
        </button>
      </div>
    </section>
  );
}
