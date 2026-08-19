import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';
import { Card } from './Card';

export interface ManipulatePanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (cardId: string) => void;
}

/**
 * Manipulate's reveal (see pendingManipulate): the top of the deck, visible
 * only to whoever used the perk (redactState carves this out like lastPeek/
 * pendingSheriff). Two sequential choices — which card to keep, then which
 * of what's left goes back on top of the deck (the last one is discarded) —
 * mirror the ability's own two decisions instead of resolving either
 * automatically. Cards render via the shared Card component so hovering one
 * shows its full description, same as the Market.
 */
export function ManipulatePanel({ state, viewerIndex, onResolve }: ManipulatePanelProps) {
  const pending = state.pendingManipulate;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Manipulate">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🎴 Manipulate</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to look at the top of the deck.</p>
      </section>
    );
  }

  const keeping = pending.phase === 'KEEP';

  return (
    <section className="cr-role" aria-label="Manipulate">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>🎴 {keeping ? 'Choose a card to keep' : 'Choose a card to put on top of the deck'}</h2>
      </header>
      <p className="cr-role__desc">
        {keeping
          ? 'Hover a card to see its description.'
          : 'The other card will be discarded.'}
      </p>
      <div className="cr-role__body">
        <div className="flex flex-wrap gap-3">
          {pending.cards.map((c) => (
            <Card key={c.id} card={c} preview onClick={() => onResolve?.(c.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
