import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface EvidenceBurnPanelProps {
  state: GameState;
  viewerIndex: number;
  onDecline?: () => void;
  onUse?: () => void;
}

/**
 * Gain Influence's free burn offer (see pendingEvidenceBurn): the Evidence
 * card just taken from an opponent can be burned on the spot — no action
 * cost — instead of sitting in hand to burn later the normal way.
 */
export function EvidenceBurnPanel({ state, viewerIndex, onDecline, onUse }: EvidenceBurnPanelProps) {
  const pending = state.pendingEvidenceBurn;
  if (!pending) return null;

  const actor = state.players.find((p) => p.id === pending.playerId);
  const viewer = state.players[viewerIndex];
  if (!actor) return null;

  if (viewer?.id !== actor.id) {
    return (
      <section className="cr-role" aria-label="Burn Evidence">
        <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
          <h2>🔥 Burn Evidence</h2>
        </header>
        <p className="cr-role__desc">Waiting for {actor.name} to decide whether to burn the Evidence they just took.</p>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Burn Evidence">
      <header className="cr-role__head" style={{ color: TEAM_META[actor.team].color }}>
        <h2>🔥 Burn this Evidence?</h2>
      </header>
      <p className="cr-role__desc">Burn the Evidence you just took for free — discard it and draw 2 cards?</p>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__use" onClick={onUse}>Burn it</button>
        <button type="button" className="cr-role__cancel" onClick={onDecline}>Keep it</button>
      </div>
    </section>
  );
}
