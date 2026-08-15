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
 * The central Evidence Grid: four category slots and the engine of the Civilian
 * win condition, so it is styled to be the most prominent shared zone. A filled
 * slot shows the card that satisfied it; when all four are filled a Criminal can
 * be Exposed. The header tracks progress toward that (`X/4 collected`).
 */
export function EvidenceGrid({ grid, onSlotClick }: EvidenceGridProps) {
  const filledCount = EVIDENCE_ORDER.filter((cat) => grid[cat].isFilled).length;
  const complete = filledCount === EVIDENCE_ORDER.length;

  return (
    <section
      className={`panel bg-gradient-to-b from-amber/5 to-transparent ring-1 transition-shadow
        ${complete ? 'ring-amber/70 shadow-[0_0_24px_rgba(245,158,11,0.25)]' : 'ring-amber/20'}`}
      aria-label="Evidence grid"
    >
      <header className="panel-head">
        <h2 className="panel-title text-lg">🔍 Evidence Grid</h2>
        {complete ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="chip bg-amber/15 text-amber ring-1 ring-amber/40"
          >
            <span aria-hidden="true">✦</span>
            <span>Ready to Expose</span>
          </motion.span>
        ) : (
          <span className="chip bg-panel-2 text-fog ring-1 ring-line">
            {filledCount}/{EVIDENCE_ORDER.length} evidence collected
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
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
              style={{
                borderColor: meta.color,
                color: meta.color,
                background: slot.isFilled ? `${meta.color}22` : undefined,
              }}
              className={`flex min-h-[104px] flex-col gap-1 rounded-xl border-2 p-3 text-left transition
                ${slot.isFilled ? 'border-solid' : 'border-dashed'}
                ${clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
            >
              <span className="flex items-center justify-between text-[13px] font-bold">
                <span>
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                {slot.isFilled ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <span className="text-fog/40" aria-hidden="true">○</span>
                )}
              </span>
              <span className={`mt-auto text-sm ${slot.isFilled ? 'font-semibold text-chalk' : 'italic text-fog/60'}`}>
                {slot.isFilled ? slot.cardName : 'Empty — needs evidence'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
