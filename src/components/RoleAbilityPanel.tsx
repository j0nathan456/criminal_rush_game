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
  const [gridCardId, setGridCardId] = useState<string | undefined>();
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

  // `discount` is 0 for collector/smuggler (no discount applies to what's
  // shown here — collector buys at full price, smuggler isn't buying at
  // all) and 1 for evil-scientist/crime-lord, so the button always shows
  // what doPurchase will actually charge. Weakened Network (rulebook p.16)
  // stacks on top: a captured Criminal pays $1 more for Expand Network
  // regardless of any discount, exactly like doPurchase's own surcharge.
  const marketRow = (cards: MarketCard[], discount = 0) => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">Nothing available.</span>}
      {cards.map((c) => {
        const surcharge = c.type === 'SPECIAL' && viewer.isCaptured ? 1 : 0;
        return chip(`${c.name} ($${Math.max(0, c.cost + surcharge - discount)})`, cardId === c.id, () => setCardId(c.id), c.id);
      })}
    </div>
  );

  const cardRow = (cards: ActionCard[], emptyMsg = 'No eligible cards.') => (
    <div className="cr-role__chips">
      {cards.length === 0 && <span className="cr-role__empty">{emptyMsg}</span>}
      {cards.map((c) => chip(c.name, cardId === c.id, () => setCardId(c.id), c.id))}
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
      body = (<><p>Buy a Tech/Chemical weapon at a $1 discount (then draw):</p>{marketRow(weapons, 1)}</>);
      canSubmit = !!cardId;
      break;
    }
    case 'crime-lord': {
      const expand = state.blackMarket.filter((c) => c.type === 'SPECIAL');
      body = (<><p>Purchase Expand Network for $1 less:</p>{marketRow(expand, 1)}</>);
      canSubmit = !!cardId;
      break;
    }
    case 'sheriff':
      // Subpoena: pick an opponent by name only — that's all this step
      // reveals. Their Evidence cards only surface after the engine commits
      // to the target (see pendingSheriff/SheriffPanel), so the reveal
      // survives online redaction the same way the Spy's peek does.
      body = (
        <>
          <p>Subpoena an opponent — you'll see their Evidence cards next:</p>
          {playerRow(opponents)}
        </>
      );
      canSubmit = !!targetId;
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
    case 'robber': {
      // Only Civilians who qualify for at least one option are offered, and
      // only the options the chosen target actually has ($3+ money, 3+ cards)
      // show up — no dead-end picks.
      const eligibleTargets = opponents.filter((p) => p.money >= 3 || p.hand.length >= 3);
      const canMoney = Boolean(target && target.money >= 3);
      const canCard = Boolean(target && target.hand.length >= 3);
      body = (
        <>
          <p>Pickpocket a Civilian:</p>
          <div className="cr-role__chips">
            {eligibleTargets.length === 0 && <span className="cr-role__empty">No eligible players.</span>}
            {eligibleTargets.map((p) => chip(p.name, targetId === p.id, () => { setTargetId(p.id); setMode(undefined); }, p.id))}
          </div>
          {target && (
            <>
              <p className="cr-role__sub">Steal what?</p>
              {modeRow([
                ...(canMoney ? [{ value: 'MONEY' as const, label: 'Steal $1' }] : []),
                ...(canCard ? [{ value: 'CARD' as const, label: 'Steal a card' }] : []),
              ])}
            </>
          )}
        </>
      );
      canSubmit = !!targetId && !!mode;
      break;
    }
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
      const filled = EVIDENCE_ORDER.filter((c) => state.evidenceGrid[c].cards.length > 0);
      const slotCards = category ? state.evidenceGrid[category].cards : [];
      body = (
        <>
          <p>Discard an Evidence card to clear a matching grid slot:</p>
          {cardRow(ownEvidence)}
          <p className="cr-role__sub">Clear which filled category?</p>
          <div className="cr-role__chips">
            {filled.map((c) =>
              chip(CATEGORY_META[c].label, category === c, () => { setCategory(c); setGridCardId(undefined); }, c),
            )}
          </div>
          {category && slotCards.length > 1 && (
            <>
              <p className="cr-role__sub">Which {CATEGORY_META[category].label} card?</p>
              <div className="cr-role__chips">
                {slotCards.map((c) => chip(c.name, gridCardId === c.id, () => setGridCardId(c.id), c.id))}
              </div>
            </>
          )}
        </>
      );
      canSubmit = !!cardId && !!category && (slotCards.length <= 1 || !!gridCardId);
      break;
    }
    default:
      body = <p>{viewer.role.name}’s ability is passive — it triggers automatically, not as an action.</p>;
      canSubmit = false;
  }

  const submit = () => onSubmit?.({ targetId, cardId, category, gridCardId, mode });

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
