import { useState } from 'react';
import type { GameState } from '../types/game';
import type { MarketCard, ActionCard } from '../types/cards';
import type { EventOptions } from '../engine';
import { TEAM_META } from '../constants/theme';

export interface EventPanelProps {
  state: GameState;
  viewerIndex: number;
  /** The Event card (in the viewer's hand) being configured. */
  card: ActionCard;
  onSubmit?: (targetId: string | undefined, options: EventOptions) => void;
  onCancel?: () => void;
  /** Confirm button label (default "Play {card.name}"). */
  submitLabel?: string;
  /**
   * Shady Press only: the card being configured isn't the viewer's own —
   * it's an opponent's card being forced into play, and the engine discards
   * it regardless of whether the effect actually applies (see reducer's
   * Shady Press case). So when this card has no legal choice at all (e.g.
   * Business Opportunity and the presser owns nothing sellable), offer to
   * discard it outright instead of leaving the player stuck unable to
   * submit — unlike playing your own Event, Cancel isn't a safe out here,
   * since it's not the player's card to keep.
   */
  forceDiscardIfImpossible?: boolean;
  /**
   * Shady Press only: the id of the Shady Press perk itself, excluded from
   * any "give up one of your own items" choice (Business Opportunity,
   * Market Exchange) this forced card offers — selling or giving away the
   * very perk whose ability is still resolving isn't a sensible choice to
   * present, and would otherwise mask genuinely-impossible cases where it's
   * the presser's only inventory item.
   */
  excludeInventoryCardId?: string;
}

const SPRING_CLEANING_DISCARDS = 3;

/**
 * Gathers the target/options a non-trivial Event card needs before it can be
 * dispatched (see resolveEvent in the engine): who it targets, which Market
 * card or owned item it touches, and Market Exchange's give/take direction.
 * Mirrors RoleAbilityPanel's "gather plausible inputs, let the engine
 * validate" approach.
 */
export function EventPanel({
  state, viewerIndex, card, onSubmit, onCancel, submitLabel, forceDiscardIfImpossible, excludeInventoryCardId,
}: EventPanelProps) {
  const viewer = state.players[viewerIndex];
  const [targetId, setTargetId] = useState<string | undefined>();
  const [marketCardId, setMarketCardId] = useState<string | undefined>();
  const [inventoryCardId, setInventoryCardId] = useState<string | undefined>();
  const [takePerk, setTakePerk] = useState<boolean | undefined>();
  const [discardIds, setDiscardIds] = useState<string[]>([]);

  if (!viewer) return null;

  const opponents = state.players.filter((p) => p.team !== viewer.team);
  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);
  const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;

  const chip = (label: string, selected: boolean, onClick: () => void, key?: string) => (
    <button key={key ?? label} type="button" className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  const playerRow = (players: typeof state.players) => (
    <div className="cr-role__chips">
      {players.length === 0 && <span className="cr-role__empty">No eligible players.</span>}
      {players.map((p) => chip(p.name, targetId === p.id, () => setTargetId(p.id), p.id))}
    </div>
  );

  const inventoryRow = (cards: MarketCard[], selected: string | undefined, onPick: (id: string) => void, emptyMsg = 'Nothing to choose.') => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">{emptyMsg}</span>}
      {cards.map((c) => chip(c.name, selected === c.id, () => onPick(c.id), c.id))}
    </div>
  );

  const toggleDiscard = (id: string) => {
    setDiscardIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= SPRING_CLEANING_DISCARDS) return cur;
      return [...cur, id];
    });
  };

  let body: React.ReactNode;
  let canSubmit: boolean;
  // True when there's no legal choice at all (as opposed to just "not picked
  // yet") — see forceDiscardIfImpossible above.
  let impossible = false;
  const submit = () => onSubmit?.(targetId, { marketCardId, inventoryCardId, takePerk, discardMarketIds: discardIds });

  switch (card.name) {
    case 'Market Access': {
      // Always a flat $1 off — the button's price already reflects what
      // doPurchase will actually charge. Only what the viewer can afford
      // (post-discount) is offered — an unaffordable card is a dead end,
      // not a choice.
      const affordable = state.publicMarket.filter((c) => Math.max(0, c.cost - 1) <= viewer.money);
      body = (
        <>
          <p>Buy a Market card for $1 off:</p>
          <div className="cr-role__chips">
            {affordable.length === 0 && (
              <span className="cr-role__empty">
                {state.publicMarket.length === 0 ? 'Nothing available.' : "You can't afford anything here."}
              </span>
            )}
            {affordable.map((c) => chip(`${c.name} ($${Math.max(0, c.cost - 1)})`, marketCardId === c.id, () => setMarketCardId(c.id), c.id))}
          </div>
        </>
      );
      canSubmit = !!marketCardId;
      impossible = affordable.length === 0;
      break;
    }
    case 'Tax Collection': {
      const taxable = opponents.filter((p) => p.money >= 1);
      body = (
        <>
          <p>Choose an opponent with $1 or more to take $1 from:</p>
          {playerRow(taxable)}
        </>
      );
      canSubmit = !!targetId;
      impossible = taxable.length === 0;
      break;
    }
    case 'Gain Influence': {
      const withCards = opponents.filter((p) => p.hand.length > 0);
      body = (
        <>
          <p>Choose an opponent to randomly take a card from:</p>
          {playerRow(withCards)}
        </>
      );
      canSubmit = !!targetId;
      impossible = withCards.length === 0;
      break;
    }
    case 'Business Opportunity': {
      const sellable = viewer.inventory.filter(
        (c) => c.type !== 'SPECIAL' && c.name !== 'Investment' && c.id !== excludeInventoryCardId,
      );
      body = (
        <>
          <p>Sell a perk or weapon for its cost + $1:</p>
          {inventoryRow(sellable, inventoryCardId, setInventoryCardId, 'Nothing sellable in your inventory.')}
        </>
      );
      canSubmit = !!inventoryCardId;
      impossible = sellable.length === 0;
      break;
    }
    case 'Market Exchange': {
      const direction = takePerk === true ? 'TAKE' : takePerk === false ? 'GIVE' : undefined;
      const givableFrom = takePerk ? target?.inventory : viewer.inventory;
      const isGivablePerk = (c: MarketCard) => c.type === 'PERK' && c.id !== excludeInventoryCardId;
      const perks = (givableFrom ?? []).filter(isGivablePerk);
      body = (
        <>
          <p>Choose a teammate to exchange a perk with:</p>
          {playerRow(teammates)}
          {target && (
            <>
              <p className="cr-role__sub">Give them a perk, or take one of theirs?</p>
              <div className="cr-role__chips">
                {chip('Give a perk', direction === 'GIVE', () => { setTakePerk(false); setInventoryCardId(undefined); }, 'give')}
                {chip('Take a perk', direction === 'TAKE', () => { setTakePerk(true); setInventoryCardId(undefined); }, 'take')}
              </div>
            </>
          )}
          {target && direction && (
            <>
              <p className="cr-role__sub">Which perk?</p>
              {inventoryRow(perks, inventoryCardId, setInventoryCardId, 'No perks to choose from.')}
            </>
          )}
        </>
      );
      canSubmit = !!targetId && takePerk !== undefined && !!inventoryCardId;
      // Not just "no teammate at all": with a teammate but nothing to move in
      // either direction (the viewer's only perk is excluded, e.g. the Shady
      // Press card still resolving, and the teammate has none either),
      // canSubmit could never become true — without this, the presser would
      // be stuck with no legal choice and no way to back out (Cancel just
      // returns to picking a different revealed card, not an option if this
      // is the only one).
      impossible = teammates.length === 0
        || (viewer.inventory.filter(isGivablePerk).length === 0 && !teammates.some((m) => m.inventory.some(isGivablePerk)));
      break;
    }
    case 'Spring Cleaning': {
      body = (
        <>
          <p>Choose exactly {SPRING_CLEANING_DISCARDS} Market cards to discard and replace ({discardIds.length}/{SPRING_CLEANING_DISCARDS} chosen):</p>
          <div className="cr-role__chips">
            {state.publicMarket.map((c) => chip(`${c.name} ($${c.cost})`, discardIds.includes(c.id), () => toggleDiscard(c.id), c.id))}
          </div>
          <p className="cr-role__sub">You'll get to buy one card from the refreshed Market at $1 off next.</p>
        </>
      );
      canSubmit = discardIds.length === SPRING_CLEANING_DISCARDS;
      impossible = state.publicMarket.length < SPRING_CLEANING_DISCARDS;
      break;
    }
    case 'Traffic Jam': {
      body = (
        <>
          <p>Choose an opponent to snarl in traffic (trading with them costs 2 actions):</p>
          {playerRow(opponents)}
        </>
      );
      canSubmit = !!targetId;
      impossible = opponents.length === 0;
      break;
    }
    default: {
      // No extra input needed (Receive Package, Generational Wealth, Lottery…) —
      // shouldn't normally reach this panel, but submit plainly if it does.
      body = <p>Play {card.name}?</p>;
      canSubmit = true;
      break;
    }
  }

  return (
    <section className="cr-role" aria-label="Event card">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🃏 {card.name}</h2>
      </header>
      <p className="cr-role__desc">{card.description}</p>
      <div className="cr-role__body">{body}</div>
      <div className="cr-role__actions">
        {impossible && forceDiscardIfImpossible ? (
          <button type="button" className="cr-role__use" onClick={() => onSubmit?.(undefined, {})}>
            Discard {card.name} — nothing to do
          </button>
        ) : (
          <button type="button" className="cr-role__use" disabled={!canSubmit} onClick={submit}>
            {submitLabel ?? `Play ${card.name}`}
          </button>
        )}
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
