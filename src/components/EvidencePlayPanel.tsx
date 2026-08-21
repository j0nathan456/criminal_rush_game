import { useState } from 'react';
import type { ActionCard, EvidenceCategory, Team } from '../types/cards';
import { EVIDENCE_ORDER, CATEGORY_META, TEAM_META } from '../constants/theme';

export interface EvidencePlayPanelProps {
  card: ActionCard;
  team: Team;
  onPlay?: (category: EvidenceCategory) => void;
  onCancel?: () => void;
  /** Every Criminal has been exposed (or captured) — cashing in is on the table. */
  canCashIn?: boolean;
  onCashIn?: () => void;
}

/**
 * A Civilian selecting an Evidence card in hand used to have to scroll up and
 * click the matching Evidence Grid slot to play it. This panel — right below
 * the Hand, like every other "confirm this play" panel — skips that trip: a
 * single-category card is one click ("Play X into Y"), a wild card offers its
 * few valid categories to choose from. The grid itself still accepts clicks
 * too; this is just the faster path.
 *
 * Once every Criminal has been exposed, there's nobody left to Expose with a
 * fuller grid, so `canCashIn` offers the alternative: discard the card for
 * $2 instead of playing it in.
 */
export function EvidencePlayPanel({ card, team, onPlay, onCancel, canCashIn, onCashIn }: EvidencePlayPanelProps) {
  const [category, setCategory] = useState<EvidenceCategory | undefined>();
  const categories = card.evidenceCategories ?? [];
  const isWild = categories.length > 1;
  const single = categories.length === 1 ? categories[0] : undefined;

  return (
    <section className="cr-role" aria-label="Play Evidence card">
      <header className="cr-role__head" style={{ color: TEAM_META[team].color }}>
        <h2>🔍 Play {card.name}</h2>
      </header>
      {isWild ? (
        <>
          <p className="cr-role__desc">Play into which category?</p>
          <div className="cr-role__body">
            <div className="cr-role__chips">
              {EVIDENCE_ORDER.filter((c) => categories.includes(c)).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cr-role__chip${category === c ? ' is-selected' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_META[c].icon} {CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="cr-role__desc">
          Play {card.name} into {single ? CATEGORY_META[single].label : 'a category'}?
        </p>
      )}
      {canCashIn && (
        <p className="cr-role__sub">Every Criminal is already exposed — you may cash this in instead.</p>
      )}
      <div className="cr-role__actions">
        <button
          type="button"
          className="cr-role__use"
          disabled={isWild && !category}
          onClick={() => {
            const chosen = single ?? category;
            if (chosen) onPlay?.(chosen);
          }}
        >
          {single ? `Play into ${CATEGORY_META[single].label}` : 'Play'}
        </button>
        {canCashIn && (
          <button type="button" className="cr-role__use" onClick={onCashIn}>
            Cash in for $2
          </button>
        )}
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
