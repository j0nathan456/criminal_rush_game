import type { Player } from '../types/game';
import { ACTIONABLE_PERKS } from '../engine';
import { TEAM_META } from '../constants/theme';

export interface PerkPickerPanelProps {
  viewer: Player;
  onSelect?: (perkId: string) => void;
  onCancel?: () => void;
}

/**
 * The Perk Action bar box's follow-up: which of the viewer's owned,
 * not-yet-used-this-turn actionable perks (Bank, Credit Card, etc.) to use.
 * Only reached when there's more than one — a single option skips straight
 * to PerkActionPanel (see useBoardInteractions' PERK_ACTION case) instead of
 * making the player click through a picker with just one choice.
 */
export function PerkPickerPanel({ viewer, onSelect, onCancel }: PerkPickerPanelProps) {
  const usable = viewer.inventory.filter(
    (c) => ACTIONABLE_PERKS.has(c.name) && !viewer.usedPerkIds?.includes(c.id),
  );

  return (
    <section className="cr-role" aria-label="Choose a perk to use">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🧰 Which perk?</h2>
      </header>
      <p className="cr-role__desc">Choose an actionable perk to use:</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {usable.length === 0 && <span className="cr-role__empty">No actionable perks available right now.</span>}
          {usable.map((c) => (
            <button key={c.id} type="button" className="cr-role__chip" onClick={() => onSelect?.(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
