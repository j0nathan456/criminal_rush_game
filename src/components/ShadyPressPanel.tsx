import { useState } from 'react';
import type { GameState } from '../types/game';
import type { EventOptions } from '../engine';
import { TEAM_META } from '../constants/theme';
import { EventPanel } from './EventPanel';
import { AllySupportPanel } from './AllySupportPanel';
import { CONFIGURABLE_EVENTS } from './panelConstants';

export interface ShadyPressPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (cardId: string, eventTargetId?: string, eventOptions?: EventOptions) => void;
}

/**
 * Shady Press's reveal (see pendingShadyPress): the target's Event cards are
 * shown only to the presser (redactState carves this out like lastPeek/
 * pendingSheriff), who then forces one to be played for their own benefit. A
 * configurable card (Tax Collection, Business Opportunity, …) needs its own
 * target/options gathered first — composes EventPanel exactly like a normal
 * Event play would, mirroring SheriffPanel's simpler single-step resolve.
 */
export function ShadyPressPanel({ state, viewerIndex, onResolve }: ShadyPressPanelProps) {
  const pending = state.pendingShadyPress;
  const [cardId, setCardId] = useState<string | undefined>();
  if (!pending) return null;

  const target = state.players.find((p) => p.id === pending.targetId);
  const presser = state.players.find((p) => p.id === pending.pressId);
  const viewer = state.players[viewerIndex];
  if (!target || !presser) return null;

  if (viewer?.id !== presser.id) {
    return (
      <section className="cr-role" aria-label="Shady Press">
        <header className="cr-role__head" style={{ color: TEAM_META[presser.team].color }}>
          <h2>🗞️ Shady Press</h2>
        </header>
        <p className="cr-role__desc">Waiting for {presser.name} to play a card from {target.name}'s Events.</p>
      </section>
    );
  }

  const chosenCard = cardId ? pending.cards.find((c) => c.id === cardId) : undefined;
  if (chosenCard && chosenCard.name === 'Ally Support') {
    // Ally Support has its own dedicated flow (see panelConstants), not
    // EventPanel — the presser is the one performing the copied Action, so
    // "a teammate or yourself" resolves against the presser's own team.
    return (
      <AllySupportPanel
        state={state}
        viewerIndex={viewerIndex}
        onSubmit={(teammateId, options) => onResolve?.(chosenCard.id, teammateId, options)}
        onCancel={() => setCardId(undefined)}
      />
    );
  }
  if (chosenCard && CONFIGURABLE_EVENTS.has(chosenCard.name)) {
    return (
      <EventPanel
        state={state}
        viewerIndex={viewerIndex}
        card={chosenCard}
        onSubmit={(eventTargetId, eventOptions) => onResolve?.(chosenCard.id, eventTargetId, eventOptions)}
        onCancel={() => setCardId(undefined)}
        forceDiscardIfImpossible
        excludeInventoryCardId={pending.perkCardId}
      />
    );
  }

  return (
    <section className="cr-role" aria-label="Shady Press">
      <header className="cr-role__head" style={{ color: TEAM_META[presser.team].color }}>
        <h2>🗞️ {target.name}'s Events, revealed</h2>
      </header>
      <p className="cr-role__desc">Choose one to play:</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {pending.cards.map((c) => (
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
          onClick={() => cardId && onResolve?.(cardId)}
        >
          Play card
        </button>
      </div>
    </section>
  );
}
