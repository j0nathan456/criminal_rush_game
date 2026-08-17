import { useState } from 'react';
import type { GameState } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META, TEAM_META } from '../constants/theme';

export interface ExposeEvidencePanelProps {
  state: GameState;
  viewerIndex: number;
  /** The Criminal being exposed (already chosen via TargetPicker). */
  targetId: string;
  onSubmit?: (targetId: string, evidenceChoices: Partial<Record<EvidenceCategory, string>>) => void;
  onCancel?: () => void;
}

/**
 * Expose spends exactly 1 Evidence card from each of the 4 grid categories.
 * More than one card can pile up in the same category (see playEvidence), so
 * whenever a category holds more than one, the exposing Civilian — not the
 * engine — chooses which is spent; the rest stay in the grid for next time.
 * Categories with only one card need no choice and are omitted here.
 */
export function ExposeEvidencePanel({ state, viewerIndex, targetId, onSubmit, onCancel }: ExposeEvidencePanelProps) {
  const viewer = state.players[viewerIndex];
  const target = state.players.find((p) => p.id === targetId);
  const [choices, setChoices] = useState<Partial<Record<EvidenceCategory, string>>>({});

  if (!viewer || !target) return null;

  const decisions = EVIDENCE_ORDER.filter((cat) => state.evidenceGrid[cat].cards.length > 1);
  const canSubmit = decisions.every((cat) => Boolean(choices[cat]));

  const chip = (label: string, selected: boolean, onClick: () => void, key: string) => (
    <button key={key} type="button" className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <section className="cr-role" aria-label="Expose — choose evidence">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🚨 Expose {target.name}</h2>
      </header>
      <p className="cr-role__desc">
        {decisions.length > 0
          ? 'Some categories hold more than one card — choose which is spent (the rest stay in the grid).'
          : 'One card per category — nothing to choose.'}
      </p>
      <div className="cr-role__body">
        {decisions.map((cat) => (
          <div key={cat}>
            <p className="cr-role__sub">{CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}:</p>
            <div className="cr-role__chips">
              {state.evidenceGrid[cat].cards.map((c) =>
                chip(c.name, choices[cat] === c.id, () => setChoices((cur) => ({ ...cur, [cat]: c.id })), c.id),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="cr-role__actions">
        <button
          type="button"
          className="cr-role__use"
          disabled={!canSubmit}
          onClick={() => onSubmit?.(targetId, choices)}
        >
          Expose {target.name}
        </button>
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
