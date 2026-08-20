import type { ActionCard } from '../types/cards';
import { CARD_TYPE_META, CATEGORY_META } from '../constants/theme';

export interface DiscardPilePanelProps {
  cards: ActionCard[];
  onClose?: () => void;
}

/**
 * Every card in the discard pile, most-recently-discarded first — opened by
 * clicking the pile itself (see Piles.tsx). The discard is fully public
 * information (unlike a hand), so this just reads state; no engine action
 * involved. Each row shows the card's type at a glance (icon + color, plus
 * Evidence's category chips), and hovering the name gives the same
 * name-plus-description tooltip every other card in the app already has.
 */
export function DiscardPilePanel({ cards, onClose }: DiscardPilePanelProps) {
  const ordered = [...cards].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <section
        className="cr-role flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden"
        aria-label="Discard pile"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Only the list below scrolls (see GameLog's same split) — the header,
            and the Close button in it, always stay put and reachable. */}
        <header className="cr-role__head flex shrink-0 items-center justify-between gap-3">
          <h2>🗑️ Discard Pile ({cards.length})</h2>
          <button type="button" className="cr-role__cancel" onClick={onClose}>Close</button>
        </header>
        {ordered.length === 0 ? (
          <p className="cr-role__empty">Nothing discarded yet.</p>
        ) : (
          <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {ordered.map((card, i) => {
              const meta = CARD_TYPE_META[card.type];
              return (
                <li key={`${card.id}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-2/70">
                  <span aria-hidden="true">{meta.icon}</span>
                  <span
                    className="cursor-help font-semibold underline decoration-dotted decoration-fog/50 underline-offset-4"
                    style={{ color: meta.color }}
                    title={`${card.name} — ${card.description}`}
                  >
                    {card.name}
                  </span>
                  <span className="text-[11px] text-fog">{meta.label}</span>
                  {card.evidenceCategories?.map((cat) => (
                    <span key={cat} className="chip text-ink" style={{ background: CATEGORY_META[cat].color }}>
                      {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
                    </span>
                  ))}
                  {card.type === 'MONEY' && card.value !== undefined && (
                    <span className="text-[11px] text-fog">${card.value}</span>
                  )}
                  {card.type === 'POWER' && card.power !== undefined && (
                    <span className="text-[11px] text-fog">+{card.power} PL</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
