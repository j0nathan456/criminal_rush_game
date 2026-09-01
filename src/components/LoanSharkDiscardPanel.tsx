import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface LoanSharkDiscardPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (cardId: string) => void;
}

/**
 * Loan Shark's Favor's start-of-turn discard (see pendingLoanSharkDiscard):
 * the holder picks which of their own cards to discard — not a random or
 * automatic pick.
 */
export function LoanSharkDiscardPanel({ state, viewerIndex, onResolve }: LoanSharkDiscardPanelProps) {
  const pending = state.pendingLoanSharkDiscard;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Loan Shark's Favor">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🦈 Loan Shark's Favor</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to discard a card.</p>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Loan Shark's Favor">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>🦈 Discard a card for Loan Shark's Favor</h2>
      </header>
      <div className="cr-role__chips">
        {actor.hand.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.description}
            className="cr-role__chip"
            onClick={() => onResolve?.(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
