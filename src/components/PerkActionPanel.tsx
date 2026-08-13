import { useState } from 'react';
import type { GameState } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import type { PerkPayload } from '../engine';
import { TEAM_META } from '../constants/theme';

export interface PerkActionPanelProps {
  state: GameState;
  viewerIndex: number;
  perkId: string;
  onSubmit?: (perkId: string, payload: PerkPayload) => void;
  onCancel?: () => void;
  /** Use this perk instead of looking it up in the viewer's inventory
   *  (Ally Support copies a teammate's perk, performed by the actor). */
  perkOverride?: MarketCard;
  /** Confirm button label (default "Use"). */
  submitLabel?: string;
}

/**
 * Collects the inputs an "Action:" perk needs and dispatches USE_PERK. Mirrors
 * the RoleAbilityPanel. The engine validates, so this only gathers plausible
 * inputs; perks with no input (Water Bottle) just need the Use button.
 */
export function PerkActionPanel({ state, viewerIndex, perkId, onSubmit, onCancel, perkOverride, submitLabel }: PerkActionPanelProps) {
  const viewer = state.players[viewerIndex];
  const [cardId, setCardId] = useState<string | undefined>();
  const [marketCardId, setMarketCardId] = useState<string | undefined>();
  const [targetId, setTargetId] = useState<string | undefined>();
  const [discardForBonus, setDiscardForBonus] = useState(false);

  if (!viewer) return null;
  const perk = perkOverride ?? viewer.inventory.find((c) => c.id === perkId);
  if (!perk) return null;

  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);
  const others = state.players.filter((p) => p.id !== viewer.id);
  const market: MarketCard[] = viewer.team === 'CRIMINAL' ? [...state.publicMarket, ...state.blackMarket] : state.publicMarket;

  const chip = (label: string, selected: boolean, onClick: () => void, key?: string) => (
    <button key={key ?? label} type="button" className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
  const cardRow = (cards: ActionCard[], empty: string) => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">{empty}</span>}
      {cards.map((c) => chip(c.name, cardId === c.id, () => setCardId(c.id), c.id))}
    </div>
  );

  let body: React.ReactNode;
  let canSubmit: boolean;

  switch (perk.name) {
    case 'Water Bottle':
      body = <p>Discard Water Bottle for an extra action.</p>;
      canSubmit = true;
      break;
    case 'Bank':
      body = (<><p>Play a Money card for +$1 value (and draw):</p>{cardRow(viewer.hand.filter((c) => c.type === 'MONEY'), 'No Money cards in hand.')}</>);
      canSubmit = !!cardId;
      break;
    case 'Recycling Bin':
      body = (<><p>Discard a card to recover one of the same type from the discard:</p>{cardRow(viewer.hand, 'Your hand is empty.')}</>);
      canSubmit = !!cardId;
      break;
    case 'Alarm Clock':
      body = (<><p>Play an Event card (then draw and gain $1):</p>{cardRow(viewer.hand.filter((c) => c.type === 'EVENT'), 'No Event cards in hand.')}</>);
      canSubmit = !!cardId;
      break;
    case 'Credit Card':
      body = (
        <>
          <p>Buy from the Market at a discount:</p>
          <div className="cr-role__chips">
            {market.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
            {market.map((c) => chip(`${c.name} ($${c.cost})`, marketCardId === c.id, () => setMarketCardId(c.id), c.id))}
          </div>
          <label className="cr-perk__toggle">
            <input type="checkbox" checked={discardForBonus} onChange={(e) => setDiscardForBonus(e.target.checked)} />
            Discard Credit Card for a $2 discount (instead of $1)
          </label>
        </>
      );
      canSubmit = !!marketCardId;
      break;
    case 'Hacked Passwords':
      body = (
        <>
          <p>Randomly steal a card from a player:</p>
          <div className="cr-role__chips">
            {others.map((p) => chip(p.name, targetId === p.id, () => setTargetId(p.id), p.id))}
          </div>
        </>
      );
      canSubmit = !!targetId;
      break;
    case 'Coffee Machine':
      body = (
        <>
          <p>Refresh the Coffee token (keep it or move it to a teammate):</p>
          <div className="cr-role__chips">
            {chip(`${viewer.name} (you)`, (targetId ?? viewer.id) === viewer.id, () => setTargetId(viewer.id), viewer.id)}
            {teammates.map((p) => chip(p.name, targetId === p.id, () => setTargetId(p.id), p.id))}
          </div>
        </>
      );
      canSubmit = true; // defaults to self
      break;
    default:
      body = <p>{perk.name} is resolved manually at the table.</p>;
      canSubmit = false;
  }

  const submit = () => onSubmit?.(perkId, { cardId, marketCardId, targetId, discardForBonus });

  return (
    <section className="cr-role" aria-label="Perk action">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🧰 {perk.name}</h2>
      </header>
      <p className="cr-role__desc">{perk.description}</p>
      <div className="cr-role__body">{body}</div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__use" disabled={!canSubmit} onClick={submit}>{submitLabel ?? 'Use'}</button>
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
