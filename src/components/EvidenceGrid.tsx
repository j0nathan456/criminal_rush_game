import { motion } from 'framer-motion';
import type { EvidenceSlot } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META } from '../constants/theme';

interface EvidenceGridProps {
  grid: Record<EvidenceCategory, EvidenceSlot>;
  /** Fired when a civilian clicks a category to play evidence into it (any category, even an already-filled one). */
  onSlotClick?: (category: EvidenceCategory) => void;
}

/**
 * The central Evidence Grid: four category slots and the engine of the Civilian
 * win condition, so it is styled to be the most prominent shared zone. A filled
 * slot lists every card played into it — more than one may pile up, since only
 * an Expose (or the Forger) removes one — and when all four hold at least one
 * card a Criminal can be Exposed. The header tracks progress (`X/4 collected`).
 */
export function EvidenceGrid({ grid, onSlotClick }: EvidenceGridProps) {
  const filledCount = EVIDENCE_ORDER.filter((cat) => grid[cat].cards.length > 0).length;
  const complete = filledCount === EVIDENCE_ORDER.length;
  // The grid is the Civilian win engine, so it carries the Civilian (blue)
  // accent — intensifying as they get close — and flips to amber once it's a
  // complete, ready-to-Expose case.
  const ring = complete
    ? 'ring-amber/70 shadow-[0_0_24px_rgba(245,158,11,0.25)]'
    : filledCount >= EVIDENCE_ORDER.length - 1
      ? 'ring-civ/60 shadow-[0_0_18px_rgba(43,108,255,0.22)]'
      : 'ring-civ/25';

  return (
    <section
      className={`panel bg-gradient-to-b from-civ/5 to-transparent ring-1 transition-shadow ${ring}`}
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
          <span className="chip bg-civ/10 text-civ ring-1 ring-civ/30">
            {filledCount}/{EVIDENCE_ORDER.length} evidence collected
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        {EVIDENCE_ORDER.map((cat) => {
          const slot = grid[cat];
          const filled = slot.cards.length > 0;
          const meta = CATEGORY_META[cat];
          // Always clickable (when a handler is given): more Evidence can pile
          // onto an already-filled category — only an Expose or the Forger
          // removes cards from the grid.
          const clickable = Boolean(onSlotClick);
          return (
            <button
              key={cat}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSlotClick!(cat) : undefined}
              style={{
                borderColor: meta.color,
                color: meta.color,
                background: filled ? `${meta.color}22` : undefined,
              }}
              className={`flex min-h-[104px] flex-col gap-1 rounded-xl border-2 p-3 text-left transition
                ${filled ? 'border-solid' : 'border-dashed'}
                ${clickable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
            >
              <span className="flex items-center justify-between text-[13px] font-bold">
                <span>
                  <span aria-hidden="true">{meta.icon}</span> {meta.label}
                </span>
                {filled ? (
                  <span aria-hidden="true">✓{slot.cards.length > 1 ? ` ×${slot.cards.length}` : ''}</span>
                ) : (
                  <span className="text-fog/40" aria-hidden="true">○</span>
                )}
              </span>
              {filled ? (
                <ul className="mt-auto space-y-0.5 text-sm font-semibold text-chalk">
                  {slot.cards.map((c) => (
                    <li key={c.id} className="truncate">{c.name}</li>
                  ))}
                </ul>
              ) : (
                <span className="mt-auto text-sm italic text-fog/60">Empty — needs evidence</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
