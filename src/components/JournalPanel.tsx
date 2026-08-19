import { useState } from 'react';
import type { GameState } from '../types/game';
import type { EventOptions } from '../engine';
import { TEAM_META } from '../constants/theme';
import { EventPanel } from './EventPanel';
import { AllySupportPanel } from './AllySupportPanel';
import { CONFIGURABLE_EVENTS } from './panelConstants';

export interface JournalPanelProps {
  state: GameState;
  viewerIndex: number;
  onDecline?: () => void;
  onUse?: (targetId: string | undefined, options: EventOptions) => void;
}

/** Events needing a fresh target/option gather before a repeat can resolve. */
function needsGathering(cardName: string): boolean {
  return CONFIGURABLE_EVENTS.has(cardName) || cardName === 'Ally Support';
}

/**
 * The Journal's offer after any Event resolves (see pendingJournal): discard
 * it to repeat that Event's effect. A card with no extra input just repeats
 * immediately; one that needs a target/option (Gain Influence, Market
 * Access…) opens the same EventPanel used for the original play, so a
 * repeat can freely choose a different target — nothing here reuses the
 * first play's choice. Ally Support is the same story via AllySupportPanel:
 * a repeat may copy a different teammate's Action entirely.
 */
export function JournalPanel({ state, viewerIndex, onDecline, onUse }: JournalPanelProps) {
  const pending = state.pendingJournal;
  const [gathering, setGathering] = useState(false);
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Journal">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>📓 Journal</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to decide whether to repeat {pending.card.name}.</p>
      </section>
    );
  }

  if (gathering && pending.card.name === 'Ally Support') {
    return (
      <AllySupportPanel
        state={state}
        viewerIndex={viewerIndex}
        onSubmit={(teammateId, options) => onUse?.(teammateId, options)}
        onCancel={() => setGathering(false)}
      />
    );
  }

  if (gathering && CONFIGURABLE_EVENTS.has(pending.card.name)) {
    return (
      <EventPanel
        state={state}
        viewerIndex={viewerIndex}
        card={pending.card}
        submitLabel={`Repeat ${pending.card.name}`}
        onSubmit={(targetId, options) => onUse?.(targetId, options)}
        onCancel={() => setGathering(false)}
      />
    );
  }

  return (
    <section className="cr-role" aria-label="Journal">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>📓 Repeat {pending.card.name}?</h2>
      </header>
      <p className="cr-role__desc">Discard your Journal to repeat the effects of this Event?</p>
      <div className="cr-role__actions">
        <button
          type="button"
          className="cr-role__use"
          onClick={() => {
            if (needsGathering(pending.card.name)) setGathering(true);
            else onUse?.(undefined, {});
          }}
        >
          Use Journal
        </button>
        <button type="button" className="cr-role__cancel" onClick={onDecline}>Decline</button>
      </div>
    </section>
  );
}
