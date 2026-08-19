import { useState } from 'react';
import type { GameState, Player } from '../types/game';
import { attackError, computeBasePower, neighborIds } from '../engine';
import { TEAM_META } from '../constants/theme';
import type { TargetMode } from './GameBoard';

export interface TargetPickerProps {
  state: GameState;
  viewerIndex: number;
  mode: Exclude<TargetMode, null>;
  onSelectTarget?: (playerId: string) => void;
  onCancel?: () => void;
}

/** Civilians may Expose an unexposed, uncaptured Criminal. */
function exposable(p: Player): boolean {
  return p.team === 'CRIMINAL' && !p.isCaptured && !p.isExposed;
}

/**
 * The Attack/Expose target picker, right below the viewer's own hand instead
 * of up in the (often-scrolled-past) Players roster. For Attack, hovering a
 * name previews both sides' actual combat PL (weapons, conditionals, Hitman,
 * Bodyguard — the same computeBasePower the fight itself will use), not just
 * base role PL, so the preview matches what would really happen.
 */
export function TargetPicker({ state, viewerIndex, mode, onSelectTarget, onCancel }: TargetPickerProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const viewer = state.players[viewerIndex];
  if (!viewer) return null;

  const viewerNeighbors = neighborIds(state, viewerIndex);
  const targets =
    mode === 'attack'
      ? state.players.filter((p) => attackError(state, viewerIndex, p) === null)
      : state.players.filter(exposable);
  const hovered = mode === 'attack' && hoveredId ? state.players.find((p) => p.id === hoveredId) : undefined;

  const clearHover = (id: string) => setHoveredId((cur) => (cur === id ? null : cur));

  return (
    <section className="cr-role" aria-label={`Choose a target to ${mode}`}>
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>{mode === 'attack' ? '⚔️ Choose a target' : '🚨 Choose a Criminal to expose'}</h2>
      </header>
      <p className="cr-role__desc">
        {mode === 'attack' ? 'Hover a name to preview both sides’ combat PL.' : 'Pick an unexposed, uncaptured Criminal.'}
      </p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {targets.length === 0 && <span className="cr-role__empty">No valid target right now.</span>}
          {targets.map((p) => {
            const areNeighbors = viewerNeighbors.includes(p.id);
            const yourPl = mode === 'attack' ? computeBasePower(viewer, p, { isAttacker: true, areNeighbors, allPlayers: state.players }) : undefined;
            const theirPl = mode === 'attack' ? computeBasePower(p, viewer, { isAttacker: false, areNeighbors, allPlayers: state.players }) : undefined;
            return (
              <button
                key={p.id}
                type="button"
                className="cr-role__chip"
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => clearHover(p.id)}
                onFocus={() => setHoveredId(p.id)}
                onBlur={() => clearHover(p.id)}
                onClick={() => onSelectTarget?.(p.id)}
                title={mode === 'attack' ? `You: ${yourPl} PL vs ${p.name}: ${theirPl} PL` : undefined}
              >
                {p.name}
              </button>
            );
          })}
        </div>
        {hovered && (
          <p className="cr-role__sub" aria-live="polite">
            You: <strong>{computeBasePower(viewer, hovered, { isAttacker: true, areNeighbors: viewerNeighbors.includes(hovered.id), allPlayers: state.players })} PL</strong> vs{' '}
            {hovered.name}: <strong>{computeBasePower(hovered, viewer, { isAttacker: false, areNeighbors: viewerNeighbors.includes(hovered.id), allPlayers: state.players })} PL</strong>
          </p>
        )}
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
