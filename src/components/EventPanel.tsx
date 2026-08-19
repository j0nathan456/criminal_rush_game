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
}

const SPRING_CLEANING_DISCARDS = 3;

/**
 * Gathers the target/options a non-trivial Event card needs before it can be
 * dispatched (see resolveEvent in the engine): who it targets, which Market
 * card or owned item it touches, and Market Exchange's give/take direction.
 * Mirrors RoleAbilityPanel's "gather plausible inputs, let the engine
 * validate" approach.
 */
export function EventPanel({ state, viewerIndex, card, onSubmit, onCancel, submitLabel }: EventPanelProps) {
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

  const marketRow = (cards: MarketCard[], selected: string | undefined, onPick: (id: string) => void) => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
      {cards.map((c) => chip(`${c.name} ($${c.cost})`, selected === c.id, () => onPick(c.id), c.id))}
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
  const submit = () => onSubmit?.(targetId, { marketCardId, inventoryCardId, takePerk, discardMarketIds: discardIds });

  switch (card.name) {
    case 'Market Access': {
      body = (
        <>
          <p>Buy a Market card for $1 off:</p>
          {marketRow(state.publicMarket, marketCardId, setMarketCardId)}
        </>
      );
      canSubmit = !!marketCardId;
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
      break;
    }
    case 'Business Opportunity': {
      const sellable = viewer.inventory.filter((c) => c.type !== 'SPECIAL' && c.name !== 'Investment');
      body = (
        <>
          <p>Sell a perk or weapon for its cost + $1:</p>
          {inventoryRow(sellable, inventoryCardId, setInventoryCardId, 'Nothing sellable in your inventory.')}
        </>
      );
      canSubmit = !!inventoryCardId;
      break;
    }
    case 'Market Exchange': {
      const direction = takePerk === true ? 'TAKE' : takePerk === false ? 'GIVE' : undefined;
      const givableFrom = takePerk ? target?.inventory : viewer.inventory;
      const perks = (givableFrom ?? []).filter((c) => c.type === 'PERK');
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
        <button type="button" className="cr-role__use" disabled={!canSubmit} onClick={submit}>
          {submitLabel ?? `Play ${card.name}`}
        </button>
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
