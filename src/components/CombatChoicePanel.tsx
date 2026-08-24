import { useState } from 'react';
import type { GameState, CombatChoiceInput } from '../types/game';
import { TEAM_META, CATEGORY_META } from '../constants/theme';

export interface CombatChoicePanelProps {
  state: GameState;
  /** Index of the local player — only `head.playerId` gets the interactive form. */
  viewerIndex: number;
  onCombatChoice?: (input: CombatChoiceInput) => void;
}

/**
 * Renders the active pre/post-combat choice (PRE or AFTER phase): Portal
 * (draw / swap), Drones (exchange — DRONES then DRONES_RETURN, since the
 * teammate picks their own card back rather than the holder picking it for
 * them), Mutants (copy), Pistol (choose a card to discard), Nurse's Triage
 * (discard a card to prevent a teammate's injury), or Leaving Evidence. This
 * is always one specific player's decision (`head.playerId` — often not
 * whoever's turn it nominally is: Leaving Evidence belongs to the injured
 * Civilian even when the Criminal attacker is the current player, Triage
 * belongs to their Nurse teammate, and DRONES_RETURN belongs to the teammate
 * who was offered the exchange, not the Drones holder). Every other viewer
 * sees a read-only "waiting on" notice instead — online play is per-player
 * devices, not a shared pass-and-play screen.
 */
export function CombatChoicePanel({ state, viewerIndex, onCombatChoice }: CombatChoicePanelProps) {
  const [teammateId, setTeammateId] = useState<string>();
  const [weaponId, setWeaponId] = useState<string>();
  const [myCardId, setMyCardId] = useState<string>();
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [perkId, setPerkId] = useState<string>();

  const combat = state.combat;
  const head = combat?.pending[0];
  if (!combat || !head) return null;

  const byId = (id: string) => state.players.find((p) => p.id === id)!;
  const holder = byId(head.playerId);
  const viewer = state.players[viewerIndex];
  const teammates = state.players.filter((p) => p.team === holder.team && p.id !== holder.id);
  const teammate = teammateId ? byId(teammateId) : undefined;

  const title =
    head.kind === 'LEAVING_EVIDENCE' ? 'Leaving Evidence'
    : head.kind === 'NURSE_HEAL' ? 'Triage'
    : head.kind === 'DRONES_RETURN' ? 'Drones — your card back'
    : head.kind === 'DESTROY_PERK' ? head.weaponName
    : head.kind === 'BARBED_WIRE' ? 'Barbed Wire'
    : `${holder.name}: ${head.kind[0]}${head.kind.slice(1).toLowerCase()}`;

  if (viewer?.id !== holder.id) {
    return (
      <section className="cr-combat" aria-label="Combat choice">
        <header className="cr-combat__head">
          <h2>⚔️ Combat — {title}</h2>
          <span className="cr-combat__turn" style={{ color: TEAM_META[holder.team].color }}>{holder.name} is deciding…</span>
        </header>
        <div className="cr-role__body">
          <p className="cr-role__desc">
            {head.kind === 'LEAVING_EVIDENCE'
              ? `Waiting for ${holder.name} to choose whether to shuffle any discarded Evidence back into the deck.`
              : head.kind === 'NURSE_HEAL'
                ? `Waiting for ${holder.name} to decide whether to use Triage on ${byId(head.injuredId).name}.`
                : head.kind === 'DRONES_RETURN'
                  ? `Waiting for ${holder.name} to choose a card to give back to ${byId(head.holderId).name} via Drones.`
                  : head.kind === 'DESTROY_PERK'
                    ? `Waiting for ${holder.name} to choose which of ${byId(head.targetId).name}'s perks to destroy with their ${head.weaponName}.`
                    : head.kind === 'BARBED_WIRE'
                      ? `Waiting for ${holder.name} to choose a card to discard for Barbed Wire.`
                      : `Waiting for ${holder.name} to decide.`}
          </p>
        </div>
      </section>
    );
  }

  const chip = (label: string, selected: boolean, onClick: () => void, key: string, title?: string) => (
    <button key={key} type="button" title={title} className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  let body: React.ReactNode;

  if (head.kind === 'PORTAL') {
    const mates = teammates.filter((p) => p.inventory.some((c) => c.type === 'WEAPON'));
    body = (
      <>
        <button type="button" className="cr-role__use" onClick={() => onCombatChoice?.({ kind: 'PORTAL', mode: 'DRAW' })}>
          Draw 2 cards
        </button>
        {holder.money >= 1 && mates.length > 0 && (
          <div className="cr-choice__block">
            <p className="cr-role__sub">…or pay $1 to swap Portal with a teammate’s weapon:</p>
            <div className="cr-role__chips">{mates.map((p) => chip(p.name, teammateId === p.id, () => { setTeammateId(p.id); setWeaponId(undefined); }, p.id))}</div>
            {teammate && (
              <div className="cr-role__chips">
                {teammate.inventory
                  .filter((c) => c.type === 'WEAPON')
                  .map((w) => chip(w.name, weaponId === w.id, () => setWeaponId(w.id), w.id, `${w.name} — ${w.description}`))}
              </div>
            )}
            <button
              type="button"
              className="cr-role__use"
              disabled={!teammateId || !weaponId}
              onClick={() => onCombatChoice?.({ kind: 'PORTAL', mode: 'SWAP', teammateId: teammateId!, teammateWeaponId: weaponId! })}
            >
              Swap ($1)
            </button>
          </div>
        )}
      </>
    );
  } else if (head.kind === 'DRONES') {
    // The teammate's hand is never shown here — they choose their own card
    // back separately (DRONES_RETURN) once this is submitted.
    const eligibleMates = teammates.filter((p) => p.hand.length > 0);
    body = (
      <>
        <button type="button" className="cr-role__cancel" onClick={() => onCombatChoice?.({ kind: 'DRONES', mode: 'SKIP' })}>
          Skip exchange
        </button>
        {eligibleMates.length > 0 && (
          <div className="cr-choice__block">
            <p className="cr-role__sub">Exchange a card with a teammate:</p>
            <p className="cr-role__sub">Your card:</p>
            <div className="cr-role__chips">{holder.hand.map((c) => chip(c.name, myCardId === c.id, () => setMyCardId(c.id), c.id))}</div>
            <p className="cr-role__sub">Teammate:</p>
            <div className="cr-role__chips">{eligibleMates.map((p) => chip(p.name, teammateId === p.id, () => setTeammateId(p.id), p.id))}</div>
            <button
              type="button"
              className="cr-role__use"
              disabled={!myCardId || !teammateId}
              onClick={() => onCombatChoice?.({ kind: 'DRONES', mode: 'EXCHANGE', cardId: myCardId!, teammateId: teammateId! })}
            >
              Exchange
            </button>
          </div>
        )}
      </>
    );
  } else if (head.kind === 'DRONES_RETURN') {
    const initiator = byId(head.holderId);
    body = (
      <>
        <p className="cr-role__sub">Choose a card to give back to {initiator.name}:</p>
        <div className="cr-role__chips">{holder.hand.map((c) => chip(c.name, myCardId === c.id, () => setMyCardId(c.id), c.id))}</div>
        <button
          type="button"
          className="cr-role__use"
          disabled={!myCardId}
          onClick={() => onCombatChoice?.({ kind: 'DRONES_RETURN', cardId: myCardId! })}
        >
          Give card
        </button>
      </>
    );
  } else if (head.kind === 'MUTANTS') {
    const oppId = head.side === 'ATTACKER' ? combat.defender.playerId : combat.attacker.playerId;
    const oppWeapons = byId(oppId).inventory.filter((c) => c.type === 'WEAPON');
    body = (
      <>
        <button type="button" className="cr-role__cancel" onClick={() => onCombatChoice?.({ kind: 'MUTANTS', mode: 'SKIP' })}>
          Copy nothing
        </button>
        {oppWeapons.length > 0 && (
          <div className="cr-choice__block">
            <p className="cr-role__sub">Copy one of the opponent’s weapons:</p>
            <div className="cr-role__chips">
              {oppWeapons.map((w) => chip(w.name, weaponId === w.id, () => setWeaponId(w.id), w.id, `${w.name} — ${w.description}`))}
            </div>
            <button
              type="button"
              className="cr-role__use"
              disabled={!weaponId}
              onClick={() => onCombatChoice?.({ kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: weaponId! })}
            >
              Copy
            </button>
          </div>
        )}
      </>
    );
  } else if (head.kind === 'PISTOL') {
    body = (
      <>
        <p className="cr-role__sub">Choose a card from your hand to discard:</p>
        <div className="cr-role__chips">{holder.hand.map((c) => chip(c.name, myCardId === c.id, () => setMyCardId(c.id), c.id))}</div>
        <button
          type="button"
          className="cr-role__use"
          disabled={!myCardId}
          onClick={() => onCombatChoice?.({ kind: 'PISTOL', cardId: myCardId! })}
        >
          Discard
        </button>
      </>
    );
  } else if (head.kind === 'BARBED_WIRE') {
    // `holder` here is the opponent forced to discard, not the Barbed Wire
    // holder — the choice belongs to whoever's hand is losing a card.
    body = (
      <>
        <p className="cr-role__sub">Barbed Wire forces you to discard — choose which card:</p>
        <div className="cr-role__chips">{holder.hand.map((c) => chip(c.name, myCardId === c.id, () => setMyCardId(c.id), c.id))}</div>
        <button
          type="button"
          className="cr-role__use"
          disabled={!myCardId}
          onClick={() => onCombatChoice?.({ kind: 'BARBED_WIRE', cardId: myCardId! })}
        >
          Discard
        </button>
      </>
    );
  } else if (head.kind === 'NURSE_HEAL') {
    const injured = byId(head.injuredId);
    body = (
      <>
        <p className="cr-role__sub">Use healing ability? Discard a card to keep {injured.name} from being injured:</p>
        <div className="cr-role__chips">
          {holder.hand.length === 0 && <span className="cr-role__empty">Your hand is empty.</span>}
          {holder.hand.map((c) => chip(c.name, myCardId === c.id, () => setMyCardId(c.id), c.id))}
        </div>
        <div className="cr-role__actions">
          <button
            type="button"
            className="cr-role__use"
            disabled={!myCardId}
            onClick={() => onCombatChoice?.({ kind: 'NURSE_HEAL', mode: 'HEAL', cardId: myCardId! })}
          >
            Use healing ability
          </button>
          <button type="button" className="cr-role__cancel" onClick={() => onCombatChoice?.({ kind: 'NURSE_HEAL', mode: 'SKIP' })}>
            Skip
          </button>
        </div>
      </>
    );
  } else if (head.kind === 'DESTROY_PERK') {
    const target = byId(head.targetId);
    const perks = target.inventory.filter((c) => c.type === 'PERK');
    body = (
      <>
        <p className="cr-role__sub">{holder.name}’s {head.weaponName} destroys one of {target.name}’s perks:</p>
        <div className="cr-role__chips">
          {perks.length === 0 && <span className="cr-role__empty">No perks to destroy.</span>}
          {perks.map((c) => chip(c.name, perkId === c.id, () => setPerkId(c.id), c.id))}
        </div>
        <button
          type="button"
          className="cr-role__use"
          disabled={!perkId}
          onClick={() => onCombatChoice?.({ kind: 'DESTROY_PERK', perkId: perkId! })}
        >
          Destroy
        </button>
      </>
    );
  } else {
    // LEAVING_EVIDENCE
    const discardEvidence = state.discardPile.filter((c) => c.type === 'EVIDENCE');
    const toggle = (id: string) =>
      setEvidenceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : cur));
    body = (
      <>
        <p className="cr-role__sub">Shuffle up to 2 discarded Evidence cards back into the deck:</p>
        <div className="cr-role__chips">
          {discardEvidence.length === 0 && <span className="cr-role__empty">No discarded Evidence.</span>}
          {discardEvidence.map((c) => {
            const categories = c.evidenceCategories?.map((cat) => CATEGORY_META[cat].label).join(', ');
            return chip(c.name, evidenceIds.includes(c.id), () => toggle(c.id), c.id, categories);
          })}
        </div>
        <div className="cr-role__actions">
          <button type="button" className="cr-role__use" onClick={() => onCombatChoice?.({ kind: 'LEAVING_EVIDENCE', evidenceIds })}>
            {evidenceIds.length > 0 ? `Shuffle ${evidenceIds.length} back` : 'Confirm'}
          </button>
          <button type="button" className="cr-role__cancel" onClick={() => onCombatChoice?.({ kind: 'LEAVING_EVIDENCE', evidenceIds: [] })}>
            Leave behind
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="cr-combat" aria-label="Combat choice">
      <header className="cr-combat__head">
        <h2>⚔️ Combat — {title}</h2>
        <span className="cr-combat__turn" style={{ color: TEAM_META[holder.team].color }}>{holder.name} decides</span>
      </header>
      <div className="cr-role__body">{body}</div>
    </section>
  );
}
