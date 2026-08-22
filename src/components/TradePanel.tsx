import { useState } from 'react';
import type { GameState, Player } from '../types/game';
import type { TradeItem } from '../engine';
import { TEAM_META, MAX_WEAPONS } from '../constants/theme';

export interface TradePanelProps {
  state: GameState;
  viewerIndex: number;
  onInitiate?: (targetId: string, give: TradeItem) => void;
  onResolveReturn?: (give: TradeItem | null) => void;
  onCancel?: () => void;
}

/**
 * Trade (rulebook p.7): the initiator gives one weapon/card/$1 to a teammate;
 * that teammate then must give one back — their own choice, not the
 * initiator's. Modeled as two one-way gifts rather than a single atomic
 * swap, matching "teammate must give back ... (their choice)". The return
 * gift is a genuine reaction offered to the recipient specifically (see
 * pendingTrade) — it blocks other actions and shows regardless of whose turn
 * it nominally is, mirroring the combat pending-choice panels.
 */
export function TradePanel({ state, viewerIndex, onInitiate, onResolveReturn, onCancel }: TradePanelProps) {
  const viewer = state.players[viewerIndex];
  const [targetId, setTargetId] = useState<string>();
  const [mode, setMode] = useState<'MONEY' | 'CARD' | 'WEAPON'>();
  const [itemId, setItemId] = useState<string>();

  if (!viewer) return null;

  const chip = (label: string, selected: boolean, onClick: () => void, key: string) => (
    <button key={key} type="button" className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  /**
   * The weapon/$1/card picker, shared by both halves of a trade. Each option
   * only appears when it's actually possible: `from` must hold that resource,
   * and a weapon additionally needs room on `to`'s side — normally capped at
   * 2. `allowOverflow` (initiating only — see applyTradeItem) lets a fresh
   * weapon gift briefly push the receiver to 3; the return leg never gets
   * this allowance, since nothing would settle it back down again.
   * `forceWeapon` is set for that settling return: the recipient is
   * currently sitting at 3 and must trade back a weapon specifically to
   * return to the limit — money, a card, or declining outright aren't
   * options until they do.
   */
  const giftPicker = (
    from: Player,
    to: Player,
    onSubmit: (item: TradeItem) => void,
    onNone?: () => void,
    forceWeapon = false,
    allowOverflow = false,
  ) => {
    const canMoney = !forceWeapon && from.money >= 1;
    const canCard = !forceWeapon && from.hand.length > 0;
    const weapons = from.inventory.filter((c) => c.type === 'WEAPON');
    const weaponCap = MAX_WEAPONS + (allowOverflow ? 1 : 0);
    const canWeapon = weapons.length > 0 && to.inventory.filter((c) => c.type === 'WEAPON').length < weaponCap;

    if (!canMoney && !canCard && !canWeapon) {
      return (
        <>
          <p className="cr-role__empty">
            {forceWeapon ? `${from.name} has no weapon to trade back.` : `${from.name} has nothing to trade.`}
          </p>
          {onNone && !forceWeapon && (
            <button type="button" className="cr-role__use" onClick={onNone}>
              Confirm — nothing to give back
            </button>
          )}
        </>
      );
    }

    return (
      <>
        <p className="cr-role__sub">Give what?</p>
        <div className="cr-role__chips">
          {canWeapon && chip('Trade a weapon', mode === 'WEAPON', () => { setMode('WEAPON'); setItemId(undefined); }, 'weapon')}
          {canMoney && chip('Trade $1', mode === 'MONEY', () => { setMode('MONEY'); setItemId(undefined); }, 'money')}
          {canCard && chip('Trade a card', mode === 'CARD', () => { setMode('CARD'); setItemId(undefined); }, 'card')}
        </div>
        {mode === 'WEAPON' && (
          <>
            <p className="cr-role__sub">Which weapon?</p>
            <div className="cr-role__chips">{weapons.map((w) => chip(w.name, itemId === w.id, () => setItemId(w.id), w.id))}</div>
          </>
        )}
        {mode === 'CARD' && (
          <>
            <p className="cr-role__sub">Which card?</p>
            <div className="cr-role__chips">{from.hand.map((c) => chip(c.name, itemId === c.id, () => setItemId(c.id), c.id))}</div>
          </>
        )}
        <div className="cr-role__actions">
          <button
            type="button"
            className="cr-role__use"
            disabled={!mode || (mode !== 'MONEY' && !itemId)}
            onClick={() => {
              if (!mode) return;
              onSubmit(mode === 'MONEY' ? { kind: 'MONEY' } : { kind: mode, cardId: itemId });
            }}
          >
            Confirm trade
          </button>
        </div>
      </>
    );
  };

  // --- Phase: a return gift is owed (see pendingTrade) -----------------------
  if (state.pendingTrade) {
    const { initiatorId, recipientId } = state.pendingTrade;
    const initiator = state.players.find((p) => p.id === initiatorId);
    const recipient = state.players.find((p) => p.id === recipientId);
    if (!initiator || !recipient) return null;

    // A weapon-for-weapon swap left the recipient holding 3 — they must
    // settle back to the 2-weapon limit with a weapon back (see
    // applyTradeItem / resolveTradeReturn's overWeaponCap check).
    const mustReturnWeapon = recipient.inventory.filter((c) => c.type === 'WEAPON').length > MAX_WEAPONS;

    if (viewer.id !== recipient.id) {
      return (
        <section className="cr-role" aria-label="Trade">
          <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
            <h2>🤝 Trade</h2>
          </header>
          <p className="cr-role__desc">Waiting for {recipient.name} to trade something back to {initiator.name}.</p>
        </section>
      );
    }

    return (
      <section className="cr-role" aria-label="Trade">
        <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
          <h2>🤝 Trade something back to {initiator.name}</h2>
        </header>
        <p className="cr-role__desc">You received a trade from {initiator.name} — now give something back.</p>
        {mustReturnWeapon && (
          <p className="cr-role__sub" style={{ color: 'var(--color-amber)' }}>
            ⚠️ You have 3 weapons — you must trade back a weapon to return to the 2-weapon limit.
          </p>
        )}
        <div className="cr-role__body">
          {giftPicker(recipient, initiator, (item) => onResolveReturn?.(item), () => onResolveReturn?.(null), mustReturnWeapon)}
        </div>
      </section>
    );
  }

  // --- Phase: initiate a fresh trade ------------------------------------------
  const teammates = state.players.filter((p) => p.team === viewer.team && p.id !== viewer.id);
  const target = targetId ? state.players.find((p) => p.id === targetId) : undefined;
  // A Traffic token snarls its holder's trades by +1 action regardless of
  // which side of the trade they're on (see initiateTrade) — the viewer's own
  // token already shows on the action bar; a token on the chosen teammate
  // only becomes knowable once picked, so it's called out here instead.
  const trafficSnarled = Boolean(target && (viewer.trafficToken || target.trafficToken));
  // Radio's discount doesn't depend on who the teammate is, so it's knowable
  // (and worth showing) before a target is even picked — mirrors initiateTrade's cost formula.
  const usesRadio = viewer.inventory.some((c) => c.name === 'Radio') && !viewer.hasUsedRadio;
  const tradeCost = Math.max(0, 1 + (trafficSnarled ? 1 : 0) - (usesRadio ? 1 : 0));
  const costModifiers: string[] = [];
  if (usesRadio) costModifiers.push('Radio −1 AP (your first trade this turn)');
  if (trafficSnarled) costModifiers.push('Traffic token +1 AP');

  return (
    <section className="cr-role" aria-label="Trade">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🤝 Trade</h2>
      </header>
      <p className="cr-role__desc">Choose a teammate, then give them a weapon, $1, or a card.</p>
      <div className="cr-role__body">
        <div className="cr-role__chips">
          {teammates.length === 0 && <span className="cr-role__empty">No teammates to trade with.</span>}
          {teammates.map((p) =>
            chip(p.trafficToken ? `${p.name} 🚧` : p.name, targetId === p.id, () => { setTargetId(p.id); setMode(undefined); setItemId(undefined); }, p.id),
          )}
        </div>
        {costModifiers.length > 0 && (
          <p className="cr-role__sub" style={{ color: 'var(--color-amber)' }}>
            {usesRadio ? '📻' : '🚧'} This trade costs {tradeCost} AP — {costModifiers.join(', ')}.
          </p>
        )}
        {target && giftPicker(viewer, target, (item) => onInitiate?.(target.id, item), undefined, false, true)}
      </div>
      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
