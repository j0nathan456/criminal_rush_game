import { useState } from 'react';
import type { GameState, CombatSide, Player, CombatChoiceInput } from '../types/game';
import { powerCardEligible } from '../engine';
import { TEAM_META } from '../constants/theme';
import { CombatChoicePanel } from './CombatChoicePanel';

export interface CombatPanelProps {
  state: GameState;
  /** Index of the local player, for gating the PRE/AFTER choice panel to its decider. */
  viewerIndex: number;
  onPlayPower?: (cardId: string, side: CombatSide, byPlayerId: string, mirrorTargetCardId?: string) => void;
  onPassCombat?: (side: CombatSide) => void;
  onDiscardMoney?: (side: CombatSide, cardIds: string[]) => void;
  onCombatChoice?: (input: CombatChoiceInput) => void;
}

/** Players who may contribute Power cards to a combatant's side: the combatant
 *  plus their teammates (powerCardEligible enforces which specific cards each may play). */
function contributors(players: Player[], combatant: Player): Player[] {
  return players.filter((p) => p.team === combatant.team);
}

/** A Mirror the player has selected but not yet chosen a target card for. */
interface MirrorPending {
  side: CombatSide;
  cardId: string;
  byPlayerId: string;
  byName: string;
}

/**
 * The interactive Power-phase panel (rulebook p.8-10). Shown whenever
 * `state.combat` is set, on every connected player's own device — both the
 * combatants and their teammates may contribute Power cards to either side
 * (see `contributors`), so this phase is intentionally shared rather than
 * restricted to a single viewer. Only cards each contributor is actually
 * allowed to play are offered (powerCardEligible mirrors the reducer's own
 * validation, so nobody sees a button that would just be rejected). The
 * PRE/AFTER phases below it are not shared: those are one specific player's
 * decision, gated in CombatChoicePanel. The fight resolves automatically once
 * both sides pass.
 */
export function CombatPanel({ state, viewerIndex, onPlayPower, onPassCombat, onDiscardMoney, onCombatChoice }: CombatPanelProps) {
  const [mirrorPending, setMirrorPending] = useState<MirrorPending | null>(null);
  const combat = state.combat;
  if (!combat) return null;

  // PRE (Portal/Drones/Mutants/Pistol) and AFTER (Nurse's Triage, Leaving Evidence) phases need a choice.
  if (combat.phase !== 'POWER') {
    return <CombatChoicePanel state={state} viewerIndex={viewerIndex} onCombatChoice={onCombatChoice} />;
  }

  const byId = (id: string) => state.players.find((p) => p.id === id)!;
  const attacker = byId(combat.attacker.playerId);
  const defender = byId(combat.defender.playerId);
  const viewer = state.players[viewerIndex];

  const playCard = (side: CombatSide, byPlayerId: string, byName: string, cardId: string, cardName: string) => {
    if (cardName === 'Mirror') {
      setMirrorPending({ side, cardId, byPlayerId, byName });
      return;
    }
    onPlayPower?.(cardId, side, byPlayerId);
  };

  const renderSide = (side: CombatSide) => {
    const part = side === 'ATTACKER' ? combat.attacker : combat.defender;
    const combatant = side === 'ATTACKER' ? attacker : defender;
    const total = part.basePower + part.powerCardBonus;
    const money = combatant.hand.filter((c) => c.type === 'MONEY');
    const hasMachineGun = combatant.inventory.some((c) => c.name === 'Machine Gun');
    const allPassed = part.passed && combat.attacker.passed && combat.defender.passed;

    return (
      <div className="cr-combat__side" key={side}>
        <header className="cr-combat__side-head" style={{ color: TEAM_META[combatant.team].color }}>
          <strong>{combatant.name}</strong>
          <span className="cr-combat__role">{side === 'ATTACKER' ? '⚔️ Attacker' : '🛡️ Defender'}</span>
        </header>

        <div className="cr-combat__total" aria-label={`${combatant.name} power`}>
          <span className="cr-combat__total-num">{total}</span>
          <span className="cr-combat__total-detail">
            base {part.basePower}
            {part.powerCardBonus > 0 && <> +{part.powerCardBonus}</>}
          </span>
        </div>

        {!part.canPlayPower && <p className="cr-combat__jammed">Signal Jammer: cannot play Power cards.</p>}

        {part.canPlayPower &&
          contributors(state.players, combatant).map((p) => {
            const powers = p.hand
              .filter((c) => c.type === 'POWER')
              .filter((c) => powerCardEligible(c, p, combatant, side, combat.played).enabled);
            if (powers.length === 0) return null;
            return (
              <div className="cr-combat__cards" key={p.id}>
                <span className="cr-combat__cards-owner">{p.id === combatant.id ? 'Your Power cards' : `${p.name}'s Power cards`}</span>
                {powers.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="cr-combat__play"
                    onClick={() => playCard(side, p.id, p.name, card.id, card.name)}
                    disabled={allPassed}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            );
          })}

        {mirrorPending?.side === side && (
          <div className="cr-combat__cards cr-choice__block">
            <span className="cr-combat__cards-owner">Mirror — copy which Power card?</span>
            <div className="cr-role__chips">
              {combat.played
                .filter((played) => played.byPlayerId !== mirrorPending.byPlayerId)
                .map((played) => (
                  <button
                    key={played.cardId}
                    type="button"
                    className="cr-role__chip"
                    onClick={() => {
                      onPlayPower?.(mirrorPending.cardId, mirrorPending.side, mirrorPending.byPlayerId, played.cardId);
                      setMirrorPending(null);
                    }}
                  >
                    {played.name} (+{played.basePower})
                  </button>
                ))}
            </div>
            <button type="button" className="cr-role__cancel" onClick={() => setMirrorPending(null)}>
              Cancel
            </button>
          </div>
        )}

        {hasMachineGun && money.length > 0 && (
          <div className="cr-combat__cards">
            <span className="cr-combat__cards-owner">Machine Gun — discard Money for +1 power each</span>
            {money.map((card) => (
              <button
                key={card.id}
                type="button"
                className="cr-combat__play cr-combat__mg"
                onClick={() => onDiscardMoney?.(side, [card.id])}
                disabled={allPassed}
              >
                {card.name} (+1)
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="cr-combat__pass"
          onClick={() => onPassCombat?.(side)}
          disabled={viewer?.id !== combatant.id}
          title={viewer?.id !== combatant.id ? `Only ${combatant.name} can pass for this side.` : undefined}
        >
          {part.passed ? 'Passed ✓' : 'Pass'}
        </button>
      </div>
    );
  };

  return (
    <section className="cr-combat" aria-label="Combat">
      <header className="cr-combat__head">
        <h2>⚔️ Combat — Power phase</h2>
        <span className="cr-combat__turn">
          {combat.turn === 'ATTACKER' ? attacker.name : defender.name} to act
        </span>
      </header>
      <div className="cr-combat__grid">
        {renderSide('ATTACKER')}
        <div className="cr-combat__vs">vs</div>
        {renderSide('DEFENDER')}
      </div>
      {combat.played.length > 0 && (
        <ul className="cr-combat__log">
          {combat.played.map((p, i) => (
            <li key={i}>
              {p.name} → {p.side === 'ATTACKER' ? attacker.name : defender.name} (+{p.power})
            </li>
          ))}
        </ul>
      )}
      <p className="cr-combat__hint">Both sides pass to resolve. Defender wins ties.</p>
    </section>
  );
}
