import { useState } from 'react';
import type { GameState } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import type { PerkPayload } from '../engine';
import { TEAM_META } from '../constants/theme';
import { EventPanel } from './EventPanel';
import { AllySupportPanel } from './AllySupportPanel';
import { CONFIGURABLE_EVENTS } from './panelConstants';

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

  // Alarm Clock's own forced Event card needs its own target/options
  // gathered once picked — Ally Support has its own dedicated flow
  // (AllySupportPanel), everything else in CONFIGURABLE_EVENTS goes through
  // EventPanel, same routing ShadyPressPanel uses for a forced Event. No
  // excludeInventoryCardId/forceDiscardIfImpossible here (unlike Shady
  // Press): the Event card hasn't been spent yet — Cancel is a safe way out,
  // and Alarm Clock itself is a perfectly legal Market Exchange/Business
  // Opportunity choice, not something mid-resolution to protect from itself.
  if (perk.name === 'Alarm Clock' && cardId) {
    const chosenCard = viewer.hand.find((c) => c.id === cardId && c.type === 'EVENT');
    if (chosenCard?.name === 'Ally Support') {
      return (
        <AllySupportPanel
          state={state}
          viewerIndex={viewerIndex}
          onSubmit={(teammateId, options) => onSubmit?.(perkId, { cardId, targetId: teammateId, eventOptions: options })}
          onCancel={() => setCardId(undefined)}
        />
      );
    }
    if (chosenCard && CONFIGURABLE_EVENTS.has(chosenCard.name)) {
      return (
        <EventPanel
          state={state}
          viewerIndex={viewerIndex}
          card={chosenCard}
          onSubmit={(eventTargetId, eventOptions) => onSubmit?.(perkId, { cardId, targetId: eventTargetId, eventOptions })}
          onCancel={() => setCardId(undefined)}
        />
      );
    }
  }

  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);
  const others = state.players.filter((p) => p.id !== viewer.id);
  const opponents = state.players.filter((p) => p.team !== viewer.team);

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
    case 'Recycling Bin': {
      // Only a card whose type already has a match in the discard is a
      // legal choice — there's nothing to recycle it into otherwise (see
      // reducer's Recycling Bin case).
      const recyclable = viewer.hand.filter((c) => state.discardPile.some((d) => d.type === c.type));
      body = (<><p>Discard a card to recover one of the same type from the discard:</p>{cardRow(recyclable, 'No card in hand has a matching type in the discard.')}</>);
      canSubmit = !!cardId;
      break;
    }
    case 'Alarm Clock':
      body = (<><p>Play an Event card (then draw and gain $1):</p>{cardRow(viewer.hand.filter((c) => c.type === 'EVENT'), 'No Event cards in hand.')}</>);
      canSubmit = !!cardId;
      break;
    case 'Credit Card': {
      const discount = discardForBonus ? 2 : 1;
      body = (
        <>
          <p>Buy from the Market at a discount:</p>
          <div className="cr-role__chips">
            {state.publicMarket.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
            {state.publicMarket.map((c) => chip(`${c.name} ($${Math.max(0, c.cost - discount)})`, marketCardId === c.id, () => setMarketCardId(c.id), c.id))}
          </div>
          <label className="cr-perk__toggle">
            <input type="checkbox" checked={discardForBonus} onChange={(e) => setDiscardForBonus(e.target.checked)} />
            Discard Credit Card for a $2 discount (instead of $1)
          </label>
        </>
      );
      canSubmit = !!marketCardId;
      break;
    }
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
    case 'Trash Can': {
      const pile = state.trashPile ?? [];
      body = (
        <>
          <p>Buy from the trash can at a $1 discount:</p>
          <div className="cr-role__chips">
            {pile.length === 0 && <span className="cr-role__empty">The trash can is empty.</span>}
            {pile.map((c) => chip(`${c.name} ($${Math.max(0, c.cost - 1)})`, marketCardId === c.id, () => setMarketCardId(c.id), c.id))}
          </div>
        </>
      );
      canSubmit = !!marketCardId;
      break;
    }
    case 'Manipulate':
      body = <p>Look at the top 3 cards of the deck: take 1, discard 1, and keep 1 on top.</p>;
      canSubmit = true;
      break;
    case 'Shady Press':
      // Press an opponent by name only — that's all this step reveals. Their
      // Event cards only surface after the engine commits to the target (see
      // pendingShadyPress/ShadyPressPanel), the same way Sheriff's Subpoena
      // survives online redaction: this client's copy of an opponent's hand
      // is otherwise hidden, so checking it here would show "no cards" even
      // when they truly have some.
      body = (
        <>
          <p>Press an opponent — you'll see their Event cards next:</p>
          <div className="cr-role__chips">
            {opponents.length === 0 && <span className="cr-role__empty">No opponents.</span>}
            {opponents.map((p) => chip(p.name, targetId === p.id, () => setTargetId(p.id), p.id))}
          </div>
        </>
      );
      canSubmit = !!targetId;
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
