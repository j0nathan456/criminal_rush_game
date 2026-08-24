import type { GameState } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { allCriminalsExposed } from '../engine';
import { TEAM_META } from '../constants/theme';
import { EvidencePlayPanel } from './EvidencePlayPanel';

export interface GainInfluencePlayPanelProps {
  state: GameState;
  viewerIndex: number;
  onResolve?: (mode: 'DECLINE' | 'GRID' | 'CASH', category?: EvidenceCategory) => void;
}

/**
 * Gain Influence's free play offer (see pendingEvidencePlay): the Civilian
 * counterpart to EvidenceBurnPanel — the Evidence card just taken from an
 * opponent can be played into the grid (or cashed in) on the spot, no action
 * cost, instead of sitting in hand to play later the normal way. Reuses
 * EvidencePlayPanel, the same "play this card" UI a normal turn offers.
 */
export function GainInfluencePlayPanel({ state, viewerIndex, onResolve }: GainInfluencePlayPanelProps) {
  const pending = state.pendingEvidencePlay;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Play Evidence card">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🔍 Play Evidence</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to decide what to do with the Evidence they just took.</p>
      </section>
    );
  }

  const card = actor.hand.find((c) => c.id === pending.cardId);
  if (!card) return null;

  return (
    <EvidencePlayPanel
      card={card}
      team={actor.team}
      onPlay={(category) => onResolve?.('GRID', category)}
      onCancel={() => onResolve?.('DECLINE')}
      canCashIn={allCriminalsExposed(state)}
      onCashIn={() => onResolve?.('CASH')}
    />
  );
}
