import { motion } from 'framer-motion';
import type { EvidenceSlot } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META } from '../constants/theme';

interface EvidenceGridProps {
  grid: Record<EvidenceCategory, EvidenceSlot>;
  /** Fired when a civilian clicks an empty slot to play evidence into it. */
  onSlotClick?: (category: EvidenceCategory) => void;
}

/**
 * The central Evidence Grid: four category slots. A filled slot shows the card
 * that satisfied it; when all four are filled a Criminal can be exposed.
 */
export function EvidenceGrid({ grid, onSlotClick }: EvidenceGridProps) {
  const complete = EVIDENCE_ORDER.every((cat) => grid[cat].isFilled);

  return (
    <section
      className={`panel transition-shadow ${complete ? 'ring-1 ring-amber/70' : ''}`}
      aria-label="Evidence grid"
    >
      <header className="panel-head">
        <h2 className="panel-title">Evidence Grid</h2>
        {complete && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="chip bg-amber/15 text-amber ring-1 ring-amber/40"
          >
            <span aria-hidden="true">✦</span>
            <span>Ready to Expose</span>
          </motion.span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        {EVIDENCE_ORDER.map((cat) => {
          const slot = grid[cat];
          const meta = CATEGORY_META[cat];
          const clickable = Boolean(onSlotClick) && !slot.isFilled;
          return (
            <button
              key={cat}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSlotClick!(cat) : undefined}
              style={{ borderColor: meta.color, color: meta.color }}
              className={`flex min-h-[74px] flex-col gap-1 rounded-xl border p-3 text-left transition
                ${slot.isFilled ? 'border-solid' : 'border-dashed'}
                ${clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
            >
              <span className="text-[13px] font-bold">
                <span aria-hidden="true">{meta.icon}</span> {meta.label}
              </span>
              <span className={`text-sm ${slot.isFilled ? 'text-chalk' : 'text-fog/70'}`}>
                {slot.isFilled ? slot.cardName : 'Empty'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
