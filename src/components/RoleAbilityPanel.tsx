import { useState } from 'react';
import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, MarketCard, ActionCard } from '../types/cards';
import type { RoleAbilityPayload } from '../engine';
import { EVIDENCE_ORDER, CATEGORY_META, TEAM_META } from '../constants/theme';
import { PASSIVE_ROLES } from './panelConstants';

export interface RoleAbilityPanelProps {
  state: GameState;
  viewerIndex: number;
  onSubmit?: (payload: RoleAbilityPayload) => void;
  onCancel?: () => void;
  /** Render a different role's controls (Ally Support copies a teammate's Action). */
  roleIdOverride?: string;
  /** Header/labels when copying another role's Action. */
  title?: string;
  subtitle?: string;
  /** Label for the confirm button (default "Use ability"). */
  submitLabel?: string;
}

type Mode = NonNullable<RoleAbilityPayload['mode']>;

/**
 * Guides the current player through their role Action (rulebook p.17). It
 * collects the inputs a given role needs (target / card / category / mode) and
 * dispatches USE_ROLE_ABILITY. The engine validates and logs any illegal choice,
 * so this panel only has to gather plausible inputs.
 */
export function RoleAbilityPanel({
  state, viewerIndex, onSubmit, onCancel, roleIdOverride, title, subtitle, submitLabel,
}: RoleAbilityPanelProps) {
  const viewer = state.players[viewerIndex];
  const [targetId, setTargetId] = useState<string | undefined>();
  const [cardId, setCardId] = useState<string | undefined>();
  const [category, setCategory] = useState<EvidenceCategory | undefined>();
  const [mode, setMode] = useState<Mode | undefined>();

  if (!viewer) return null;
  const roleId = roleIdOverride ?? viewer.role.id;

  const opponents = state.players.filter((p) => p.team !== viewer.team);
  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);
  const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;
  const ownEvidence = viewer.hand.filter((c) => c.type === 'EVIDENCE');

  const chip = (label: string, selected: boolean, onClick: () => void, key?: string) => (
    <button
      key={key ?? label}
      type="button"
      className={`cr-role__chip${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const playerRow = (players: Player[]) => (
    <div className="cr-role__chips">
      {players.length === 0 && <span className="cr-role__empty">No eligible players.</span>}
      {players.map((p) =>
        chip(`${p.name}`, targetId === p.id, () => setTargetId(p.id), p.id),
      )}
    </div>
  );

  const marketRow = (cards: MarketCard[]) => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
      {cards.map((c) => chip(`${c.name} ($${c.cost})`, cardId === c.id, () => setCardId(c.id), c.id))}
    </div>
  );

  const cardRow = (cards: ActionCard[], emptyMsg = 'No eligible cards.') => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">{emptyMsg}</span>}
      {cards.map((c) => chip(c.name, cardId === c.id, () => setCardId(c.id), c.id))}
    </div>
  );

  const categoryRow = (only?: EvidenceCategory[]) => (
    <div className="cr-role__chips">
      {EVIDENCE_ORDER.filter((c) => !only || only.includes(c)).map((c) =>
        chip(CATEGORY_META[c].label, category === c, () => setCategory(c), c),
      )}
    </div>
  );

  const modeRow = (options: { value: Mode; label: string }[]) => (
    <div className="cr-role__chips">
      {options.map((o) => chip(o.label, mode === o.value, () => setMode(o.value), o.value))}
    </div>
  );

  // --- Per-role controls (every branch, incl. default, assigns both) ---------
  let body: React.ReactNode;
  let canSubmit: boolean;

  switch (roleId) {
    case 'collector':
      body = (<><p>Buy a perk or weapon from the Market (then collect $1):</p>{marketRow(state.publicMarket)}</>);
      canSubmit = !!cardId;
      break;
    case 'smuggler':
      body = (<><p>Move a Market card into the Black Market ($1 cheaper there):</p>{marketRow(state.publicMarket)}</>);
      canSubmit = !!cardId;
      break;
    case 'evil-scientist': {
      const weapons = [...state.publicMarket, ...state.blackMarket].filter(
        (c) => c.type === 'WEAPON' && (c.weaponType === 'TECH' || c.weaponType === 'CHEMICAL'),
      );
      body = (<><p>Buy a Tech/Chemical weapon at a $1 discount (then draw):</p>{marketRow(weapons)}</>);
      canSubmit = !!cardId;
      break;
    }
    case 'crime-lord': {
      const expand = state.blackMarket.filter((c) => c.type === 'SPECIAL');
      body = (<><p>Purchase Expand Network for $1 less:</p>{marketRow(expand)}</>);
      canSubmit = !!cardId;
      break;
    }
    case 'sheriff':
      body = (
        <>
          <p>Subpoena an opponent, then play one of their Evidence cards:</p>
          {playerRow(opponents)}
          {target && (<><p className="cr-role__sub">Choose an Evidence card:</p>{cardRow(target.hand.filter((c) => c.type === 'EVIDENCE'), 'No Evidence cards visible.')}</>)}
          {cardId && (<><p className="cr-role__sub">Play into which category?</p>{categoryRow()}</>)}
        </>
      );
      canSubmit = !!targetId && !!cardId && !!category;
      break;
    case 'nurse':
      body = (
        <>
          <p>Discard a card to heal an injured teammate:</p>
          {playerRow(teammates.filter((p) => p.isInjured))}
          <p className="cr-role__sub">Discard from your hand:</p>
          {cardRow(viewer.hand, 'Your hand is empty.')}
        </>
      );
      canSubmit = !!targetId && !!cardId;
      break;
    case 'bodyguard':
      body = (<><p>Give the Bodyguard token to a teammate:</p>{playerRow(teammates)}</>);
      canSubmit = !!targetId;
      break;
    case 'witness': {
      const discardedEvidence = state.discardPile.filter((c) => c.type === 'EVIDENCE');
      body = (
        <>
          <p>Take an Evidence card from the discard pile:</p>
          {cardRow(discardedEvidence, 'No Evidence in the discard pile.')}
          <p className="cr-role__sub">Give it to which teammate?</p>
          {playerRow(teammates)}
        </>
      );
      canSubmit = !!cardId && !!targetId;
      break;
    }
    case 'robber':
      body = (
        <>
          <p>Pickpocket a Civilian:</p>
          {playerRow(opponents)}
          <p className="cr-role__sub">Steal what?</p>
          {modeRow([{ value: 'MONEY', label: 'Steal $1 (needs $3+)' }, { value: 'CARD', label: 'Steal a card (needs 3+)' }])}
        </>
      );
      canSubmit = !!targetId && !!mode;
      break;
    case 'arsonist':
      body = (
        <>
          <p>Threaten an opponent — they'll choose to lose $1 or discard a card:</p>
          {playerRow(opponents)}
        </>
      );
      canSubmit = !!targetId;
      break;
    case 'forger': {
      const filled = EVIDENCE_ORDER.filter((c) => state.evidenceGrid[c].isFilled);
      body = (
        <>
          <p>Discard an Evidence card to clear a matching grid slot:</p>
          {cardRow(ownEvidence)}
          <p className="cr-role__sub">Clear which filled category?</p>
          {categoryRow(filled)}
        </>
      );
      canSubmit = !!cardId && !!category;
      break;
    }
    default:
      body = <p>{viewer.role.name}’s ability is passive — it triggers automatically, not as an action.</p>;
      canSubmit = false;
  }

  const submit = () => onSubmit?.({ targetId, cardId, category, mode });

  return (
    <section className="cr-role" aria-label="Role ability">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>✨ {title ?? `${viewer.role.name} — ${viewer.role.abilityName}`}</h2>
      </header>
      <p className="cr-role__desc">{subtitle ?? viewer.role.abilityDescription}</p>
      <div className="cr-role__body">{body}</div>
      <div className="cr-role__actions">
        {!PASSIVE_ROLES.has(roleId) && (
          <button type="button" className="cr-role__use" disabled={!canSubmit} onClick={submit}>
            {submitLabel ?? 'Use ability'}
          </button>
        )}
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
