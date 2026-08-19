import type { GameState } from '../types/game';
import { TEAM_META } from '../constants/theme';

export interface BodyguardSetupPanelProps {
  state: GameState;
  /** Index of the local player — only the Bodyguard gets the interactive form. */
  viewerIndex: number;
  onResolve?: (targetId: string) => void;
}

/**
 * The Bodyguard's start-of-game Protection choice (rulebook p.17, see
 * pendingBodyguardSetup): only offered when there are 2+ other Civilian
 * teammates to choose from — with just one, createGame assigns the token
 * automatically and this never renders. It's the Bodyguard's own decision,
 * not the starting player's, so — like ThreatenPanel — every other viewer
 * sees a read-only "deciding…" notice instead of the form, and nothing else
 * can happen (including ending the first turn) until it's answered.
 */
export function BodyguardSetupPanel({ state, viewerIndex, onResolve }: BodyguardSetupPanelProps) {
  const pending = state.pendingBodyguardSetup;
  if (!pending) return null;

  const bodyguard = state.players.find((p) => p.id === pending.bodyguardId);
  const viewer = state.players[viewerIndex];
  if (!bodyguard) return null;

  const teammates = state.players.filter((p) => p.team === bodyguard.team && p.id !== bodyguard.id);

  if (viewer?.id !== bodyguard.id) {
    return (
      <section className="cr-role" aria-label="Bodyguard setup">
        <header className="cr-role__head" style={{ color: TEAM_META[bodyguard.team].color }}>
          <h2>🛡️ Bodyguard's Protection</h2>
        </header>
        <p className="cr-role__desc">Waiting for {bodyguard.name} to choose who to protect.</p>
      </section>
    );
  }

  return (
    <section className="cr-role" aria-label="Bodyguard setup">
      <header className="cr-role__head" style={{ color: TEAM_META[bodyguard.team].color }}>
        <h2>🛡️ Choose who to protect</h2>
      </header>
      <p className="cr-role__desc">Give the Protection token to a Civilian teammate:</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {teammates.map((p) => (
            <button key={p.id} type="button" className="cr-role__chip" onClick={() => onResolve?.(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
