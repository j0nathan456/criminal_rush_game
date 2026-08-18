import { useState } from 'react';
import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface ThreatenPanelProps {
  state: GameState;
  /** Index of the local player — only the targeted Civilian gets the interactive form. */
  viewerIndex: number;
  onResolveThreaten?: (mode: 'MONEY' | 'DISCARD', cardId?: string) => void;
}

/**
 * The Arsonist's Threaten leaves the targeted Civilian with a choice: lose $1
 * or discard a card of their own choosing (not random). It's their decision,
 * not the Arsonist's (see pendingThreaten), so — like CombatChoicePanel —
 * every other viewer sees a read-only "deciding…" notice instead of the form.
 */
export function ThreatenPanel({ state, viewerIndex, onResolveThreaten }: ThreatenPanelProps) {
  const pending = state.pendingThreaten;
  const [discarding, setDiscarding] = useState(false);
  const [cardId, setCardId] = useState<string | undefined>();
  if (!pending) return null;

  const target = state.players.find((p) => p.id === pending.targetId);
  const viewer = state.players[viewerIndex];
  if (!target) return null;

  if (viewer?.id !== target.id) {
    return (
      <section className="cr-role" aria-label="Threaten choice">
        <header className="cr-role__head" style={{ color: TEAM_META[target.team].color }}>
          <h2>🔥 Threaten</h2>
        </header>
        <p className="cr-role__desc">Waiting for {target.name} to choose: lose $1, or discard a card.</p>
      </section>
    );
  }

  const canMoney = target.money > 0;
  const canDiscard = target.hand.length > 0;

  if (discarding) {
    return (
      <section className="cr-role" aria-label="Threaten choice">
        <header className="cr-role__head" style={{ color: TEAM_META[target.team].color }}>
          <h2>🔥 Choose a card to discard</h2>
        </header>
        <div className="cr-role__body">
          <div className="cr-role__chips">
            {target.hand.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cr-role__chip${cardId === c.id ? ' is-selected' : ''}`}
                onClick={() => setCardId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="cr-role__actions">
          <button
            type="button"
            className="cr-role__use"
            disabled={!cardId}
            onClick={() => cardId && onResolveThreaten?.('DISCARD', cardId)}
          >
            Discard
          </button>
          <button type="button" className="cr-role__cancel" onClick={() => { setDiscarding(false); setCardId(undefined); }}>
            Back
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Threaten choice">
      <header className="cr-role__head" style={{ color: TEAM_META[target.team].color }}>
        <h2>🔥 You've been threatened</h2>
      </header>
      <p className="cr-role__desc">Choose one:</p>
      <div className="cr-role__actions">
        <button
          type="button"
          className="cr-role__use"
          disabled={!canMoney}
          onClick={() => onResolveThreaten?.('MONEY')}
        >
          Lose $1
        </button>
        <button
          type="button"
          className="cr-role__use"
          disabled={!canDiscard}
          onClick={() => setDiscarding(true)}
        >
          Discard a card
        </button>
      </div>
    </section>
  );
}
