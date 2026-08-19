import type { GameState } from '../types/game';
import { TEAM_META, CARD_TYPE_META } from '../constants/theme';

export interface RecyclingBinPanelProps {
  state: GameState;
  viewerIndex: number;
  /** cardId set for the TAKE phase's pick (omit to acknowledge no match); mode set for the REWARD phase's choice. */
  onResolve?: (cardId: string | undefined, mode: 'MONEY' | 'DRAW' | undefined) => void;
}

/**
 * Recycling Bin's two-step follow-up (see pendingRecyclingBin), live once
 * the chosen hand card has already been discarded: TAKE offers every
 * same-type card currently in the discard pile to recover (or, with none
 * available, just an acknowledgement), then REWARD offers the card text's
 * "$1 or draw 1" choice.
 */
export function RecyclingBinPanel({ state, viewerIndex, onResolve }: RecyclingBinPanelProps) {
  const pending = state.pendingRecyclingBin;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Recycling Bin">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>♻️ Recycling Bin</h2>
        </header>
        <p className="cr-role__desc">
          {pending.phase === 'TAKE'
            ? `Waiting for ${actor.name} to recycle a card from the discard.`
            : `Waiting for ${actor.name} to choose $1 or a draw from the Recycling Bin.`}
        </p>
      </section>
    );
  }

  if (pending.phase === 'TAKE') {
    const typeLabel = CARD_TYPE_META[pending.discardedType].label;
    const candidates = state.discardPile.filter(
      (c) => c.type === pending.discardedType && c.id !== pending.discardedCardId,
    );
    return (
      <section className="cr-role" aria-label="Recycling Bin">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>♻️ Recycling Bin</h2>
        </header>
        {candidates.length === 0 ? (
          <>
            <p className="cr-role__desc">
              No other {typeLabel} cards in the discard — you can't use the Recycling Bin on this card.
            </p>
            <button type="button" className="cr-role__use" onClick={() => onResolve?.(undefined, undefined)}>
              Continue
            </button>
          </>
        ) : (
          <>
            <p className="cr-role__desc">Take a {typeLabel} card from the discard:</p>
            <div className="cr-role__chips">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={`${c.name} — ${c.description}`}
                  className="cr-role__chip"
                  onClick={() => onResolve?.(c.id, undefined)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Recycling Bin">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>♻️ Recycling Bin</h2>
      </header>
      <p className="cr-role__desc">Choose your payout:</p>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__use" onClick={() => onResolve?.(undefined, 'MONEY')}>Gain $1</button>
        <button type="button" className="cr-role__use" onClick={() => onResolve?.(undefined, 'DRAW')}>Draw a card</button>
      </div>
    </section>
  );
}
