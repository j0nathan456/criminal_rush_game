import { useState } from 'react';
import type { GameState } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META, TEAM_META } from '../constants/theme';

export interface SheriffPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (cardId: string, category?: EvidenceCategory) => void;
}

/**
 * The Sheriff's Subpoena reveal (see pendingSheriff): the target's Evidence
 * cards are shown only to the Sheriff (redactState carves this out like
 * lastPeek), who then plays one — into its one valid category automatically,
 * or a chosen category for a wild card.
 */
export function SheriffPanel({ state, viewerIndex, onResolve }: SheriffPanelProps) {
  const pending = state.pendingSheriff;
  const [cardId, setCardId] = useState<string | undefined>();
  const [category, setCategory] = useState<EvidenceCategory | undefined>();
  if (!pending) return null;

  const target = state.players.find((p) => p.id === pending.targetId);
  const sheriff = state.players.find((p) => p.id === pending.sheriffId);
  const viewer = state.players[viewerIndex];
  if (!target || !sheriff) return null;

  if (viewer?.id !== sheriff.id) {
    return (
      <section className="cr-role" aria-label="Sheriff's subpoena">
        <header className="cr-role__head" style={{ color: TEAM_META[sheriff.team].color }}>
          <h2>🚔 Subpoena</h2>
        </header>
        <p className="cr-role__desc">Waiting for {sheriff.name} to play a card from {target.name}'s Evidence.</p>
      </section>
    );
  }

  const chosenCard = cardId ? pending.cards.find((c) => c.id === cardId) : undefined;
  const cardCategories = chosenCard?.evidenceCategories ?? [];
  const isWild = cardCategories.length > 1;
  const canSubmit = !!cardId && (!isWild || !!category);

  return (
    <section className="cr-role" aria-label="Sheriff's subpoena">
      <header className="cr-role__head" style={{ color: TEAM_META[sheriff.team].color }}>
        <h2>🚔 {target.name}'s Evidence, revealed</h2>
      </header>
      <p className="cr-role__desc">Choose one to play:</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {pending.cards.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cr-role__chip${cardId === c.id ? ' is-selected' : ''}`}
              onClick={() => { setCardId(c.id); setCategory(undefined); }}
            >
              {c.name}
            </button>
          ))}
        </div>
        {chosenCard && isWild && (
          <>
            <p className="cr-role__sub">Play into which category?</p>
            <div className="cr-role__chips">
              {EVIDENCE_ORDER.filter((c) => cardCategories.includes(c)).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cr-role__chip${category === c ? ' is-selected' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="cr-role__actions">
        <button
          type="button"
          className="cr-role__use"
          disabled={!canSubmit}
          onClick={() => cardId && onResolve?.(cardId, category)}
        >
          Play card
        </button>
      </div>
    </section>
  );
}
