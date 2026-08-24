import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface CoffeeRecipientPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (recipientId: string) => void;
}

/**
 * Coffee Machine's post-purchase choice (see pendingCoffeeRecipient): the
 * buyer picks who gets the token — themselves or a teammate. Follows every
 * purchase path (the Buy action, Collector's Commission, Credit Card,
 * Market Access, ...), not just a direct Market buy.
 */
export function CoffeeRecipientPanel({ state, viewerIndex, onResolve }: CoffeeRecipientPanelProps) {
  const pending = state.pendingCoffeeRecipient;
  if (!pending) return null;

  const buyer = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!buyer) return null;

  if (viewer?.id !== buyer.id) {
    return (
      <section className="cr-role" aria-label="Coffee Machine">
        <header className="cr-role__head" style={{ color: TEAM_META[buyer.team].color }}>
          <h2>☕ Coffee Machine</h2>
        </header>
        <p className="cr-role__desc">Waiting for {buyer.name} to choose who gets the Coffee token.</p>
      </section>
    );
  }

  const teammates = state.players.filter((p) => p.team === buyer.team && p.id !== buyer.id);

  return (
    <section className="cr-role" aria-label="Coffee Machine">
      <header className="cr-role__head" style={{ color: TEAM_META[buyer.team].color }}>
        <h2>☕ Coffee Machine</h2>
      </header>
      <p className="cr-role__desc">Give the Coffee token to:</p>
      <div className="cr-role__chips">
        <button type="button" className="cr-role__chip" onClick={() => onResolve?.(buyer.id)}>
          {buyer.name} (you)
        </button>
        {teammates.map((p) => (
          <button key={p.id} type="button" className="cr-role__chip" onClick={() => onResolve?.(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
    </section>
  );
}
