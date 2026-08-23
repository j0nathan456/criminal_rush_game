import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface TrashCanPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (cardId: string) => void;
}

/**
 * Trash Can's start-of-turn choice (see pendingTrashCan): the holder picks
 * which Market card to bin — not an automatic top-of-Market pick.
 */
export function TrashCanPanel({ state, viewerIndex, onResolve }: TrashCanPanelProps) {
  const pending = state.pendingTrashCan;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Trash Can">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🗑️ Trash Can</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to choose a Market card to bin.</p>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Trash Can">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>🗑️ Bin a Market card</h2>
      </header>
      <div className="cr-role__chips">
        {state.publicMarket.length === 0 && <span className="cr-role__empty">The Market is empty.</span>}
        {state.publicMarket.map((c) => (
          <button
            key={c.id}
            type="button"
            title={`${c.name} — ${c.description}`}
            className="cr-role__chip"
            onClick={() => onResolve?.(c.id)}
          >
            {c.name} (${c.cost})
          </button>
        ))}
      </div>
    </section>
  );
}
