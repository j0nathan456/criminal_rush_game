import type { EvidenceSlot } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META } from '../constants/theme';

interface EvidenceGridProps {
  grid: Record<EvidenceCategory, EvidenceSlot>;
  /** Fired when a civilian clicks an empty slot to play evidence into it. */
  onSlotClick?: (category: EvidenceCategory) => void;
}

/**
 * The central Evidence Grid: four category slots (Time, Means, Location,
 * Motive). A filled slot shows the card that satisfied it. When all four are
 * filled the grid is "complete" and a Criminal can be exposed.
 */
export function EvidenceGrid({ grid, onSlotClick }: EvidenceGridProps) {
  const complete = EVIDENCE_ORDER.every((cat) => grid[cat].isFilled);

  return (
    <section className={`cr-evidence${complete ? ' is-complete' : ''}`} aria-label="Evidence grid">
      <header className="cr-panel__head">
        <h2>Evidence Grid</h2>
        {complete && <span className="cr-evidence__ready">Ready to Expose</span>}
      </header>

      <div className="cr-evidence__slots">
        {EVIDENCE_ORDER.map((cat) => {
          const slot = grid[cat];
          const meta = CATEGORY_META[cat];
          const clickable = Boolean(onSlotClick) && !slot.isFilled;
          return (
            <button
              key={cat}
              type="button"
              className={`cr-slot${slot.isFilled ? ' is-filled' : ''}`}
              style={{ '--slot-accent': meta.color } as React.CSSProperties}
              disabled={!clickable}
              onClick={clickable ? () => onSlotClick!(cat) : undefined}
            >
              <span className="cr-slot__label">
                <span aria-hidden="true">{meta.icon}</span> {meta.label}
              </span>
              <span className="cr-slot__value">
                {slot.isFilled ? slot.cardName : 'Empty'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
