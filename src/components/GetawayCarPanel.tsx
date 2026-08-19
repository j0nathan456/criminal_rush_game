import { useState } from 'react';
import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface GetawayCarPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (give: boolean, teammateId?: string, cardId?: string) => void;
}

/**
 * Getaway Car's start-of-turn offer (see pendingGetawayCarGift): give the
 * perk — plus one hand card, paired per the card text — to a teammate. A
 * plain yes/no first, then (on yes) a teammate picker, then a card picker;
 * only the final pick actually dispatches, so backing up costs nothing.
 */
export function GetawayCarPanel({ state, viewerIndex, onResolve }: GetawayCarPanelProps) {
  const pending = state.pendingGetawayCarGift;
  const [stage, setStage] = useState<'ask' | 'teammate' | 'card'>('ask');
  const [teammateId, setTeammateId] = useState<string>();

  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Getaway Car">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🚗 Getaway Car</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to decide whether to give away their Getaway Car.</p>
      </section>
    );
  }

  if (stage === 'ask') {
    return (
      <section className="cr-role" aria-label="Getaway Car">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🚗 Give teammate Getaway Car?</h2>
        </header>
        <div className="cr-role__actions">
          <button type="button" className="cr-role__use" onClick={() => setStage('teammate')}>Yes</button>
          <button type="button" className="cr-role__cancel" onClick={() => onResolve?.(false)}>No</button>
        </div>
      </section>
    );
  }

  const teammates = state.players.filter((p) => p.team === actor.team && p.id !== actor.id);

  if (stage === 'teammate') {
    return (
      <section className="cr-role" aria-label="Getaway Car">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🚗 Give it to…</h2>
        </header>
        <div className="cr-role__chips">
          {teammates.length === 0 && <span className="cr-role__empty">No teammates to give it to.</span>}
          {teammates.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cr-role__chip"
              onClick={() => { setTeammateId(p.id); setStage('card'); }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="cr-role__actions">
          <button type="button" className="cr-role__cancel" onClick={() => setStage('ask')}>Back</button>
        </div>
      </section>
    );
  }

  // stage === 'card'
  const teammate = state.players.find((p) => p.id === teammateId);
  return (
    <section className="cr-role" aria-label="Getaway Car">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>🚗 Choose a card for {teammate?.name}</h2>
      </header>
      <div className="cr-role__chips">
        {actor.hand.length === 0 && <span className="cr-role__empty">Your hand is empty.</span>}
        {actor.hand.map((c) => (
          <button
            key={c.id}
            type="button"
            title={`${c.name} — ${c.description}`}
            className="cr-role__chip"
            onClick={() => onResolve?.(true, teammateId, c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={() => setStage('teammate')}>Back</button>
      </div>
    </section>
  );
}
