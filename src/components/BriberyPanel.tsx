import { useState } from 'react';
import type { GameState } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { TEAM_META, CATEGORY_META, EVIDENCE_ORDER } from '../constants/theme';

export interface BriberyPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (targetId: string, category: EvidenceCategory, cardId: string) => void;
}

/**
 * Bribery's sell trigger (see pendingBribery): pay $1 to a Civilian, then
 * discard one Evidence card from the grid. The card text has no "may", so
 * unlike Getaway Car there's no decline stage — just pick who gets paid,
 * then which grid card to discard.
 */
export function BriberyPanel({ state, viewerIndex, onResolve }: BriberyPanelProps) {
  const pending = state.pendingBribery;
  const [stage, setStage] = useState<'target' | 'card'>('target');
  const [targetId, setTargetId] = useState<string>();

  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Bribery">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>💰 Bribery</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to bribe a Civilian.</p>
      </section>
    );
  }

  const civilians = state.players.filter((p) => p.team === 'CIVILIAN' && p.id !== actor.id);

  if (stage === 'target') {
    return (
      <section className="cr-role" aria-label="Bribery">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>💰 Pay $1 to which Civilian?</h2>
        </header>
        <div className="cr-role__chips">
          {civilians.length === 0 && <span className="cr-role__empty">No Civilian to bribe.</span>}
          {civilians.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cr-role__chip"
              onClick={() => { setTargetId(p.id); setStage('card'); }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // stage === 'card'
  const target = state.players.find((p) => p.id === targetId);
  const cards = EVIDENCE_ORDER.flatMap((category) =>
    state.evidenceGrid[category].cards.map((card) => ({ category, card })),
  );

  return (
    <section className="cr-role" aria-label="Bribery">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>💰 Discard which Evidence card?</h2>
      </header>
      <p className="cr-role__desc">Paying {target?.name} $1 — now pick a grid card to discard.</p>
      <div className="cr-role__chips">
        {cards.length === 0 && <span className="cr-role__empty">The grid has no Evidence.</span>}
        {cards.map(({ category, card }) => (
          <button
            key={card.id}
            type="button"
            title={`${card.name} — ${card.description}`}
            className="cr-role__chip"
            onClick={() => targetId && onResolve?.(targetId, category, card.id)}
          >
            <span aria-hidden="true">{CATEGORY_META[category].icon}</span> {card.name}
          </button>
        ))}
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={() => setStage('target')}>Back</button>
      </div>
    </section>
  );
}
