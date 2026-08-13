import type { GameState, CombatSide, Player, CombatChoiceInput } from '../types/game';
import { TEAM_META } from '../constants/theme';
import { CombatChoicePanel } from './CombatChoicePanel';

export interface CombatPanelProps {
  state: GameState;
  onPlayPower?: (cardId: string, side: CombatSide, byPlayerId: string) => void;
  onPassCombat?: (side: CombatSide) => void;
  onDiscardMoney?: (side: CombatSide, cardIds: string[]) => void;
  onCombatChoice?: (input: CombatChoiceInput) => void;
}

/** Players who may contribute Power cards to a combatant's side: the combatant
 *  plus their teammates (the engine enforces which specific cards are legal). */
function contributors(players: Player[], combatant: Player): Player[] {
  return players.filter((p) => p.team === combatant.team);
}

/**
 * The interactive Power-phase panel (rulebook p.8-10). Shown whenever
 * `state.combat` is set. Pass-and-play: the device operates both sides — it can
 * play any eligible Power card, discard Money via Machine Gun, and pass. The
 * fight resolves automatically once both sides pass.
 */
export function CombatPanel({ state, onPlayPower, onPassCombat, onDiscardMoney, onCombatChoice }: CombatPanelProps) {
  const combat = state.combat;
  if (!combat) return null;

  // PRE (Portal/Drones/Mutants) and AFTER (Leaving Evidence) phases need a choice.
  if (combat.phase !== 'POWER') {
    return <CombatChoicePanel state={state} onCombatChoice={onCombatChoice} />;
  }

  const byId = (id: string) => state.players.find((p) => p.id === id)!;
  const attacker = byId(combat.attacker.playerId);
  const defender = byId(combat.defender.playerId);

  const renderSide = (side: CombatSide) => {
    const part = side === 'ATTACKER' ? combat.attacker : combat.defender;
    const combatant = side === 'ATTACKER' ? attacker : defender;
    const total = part.basePower + part.powerCardBonus;
    const money = combatant.hand.filter((c) => c.type === 'MONEY');
    const hasMachineGun = combatant.inventory.some((c) => c.name === 'Machine Gun');

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
            const powers = p.hand.filter((c) => c.type === 'POWER');
            if (powers.length === 0) return null;
            return (
              <div className="cr-combat__cards" key={p.id}>
                <span className="cr-combat__cards-owner">{p.id === combatant.id ? 'Your Power cards' : `${p.name}'s Power cards`}</span>
                {powers.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="cr-combat__play"
                    onClick={() => onPlayPower?.(card.id, side, p.id)}
                    disabled={part.passed && combat.attacker.passed && combat.defender.passed}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            );
          })}

        {hasMachineGun && money.length > 0 && (
          <button
            type="button"
            className="cr-combat__play cr-combat__mg"
            onClick={() => onDiscardMoney?.(side, money.map((c) => c.id))}
          >
            Machine Gun: discard {money.length} Money (+{money.length})
          </button>
        )}

        <button type="button" className="cr-combat__pass" onClick={() => onPassCombat?.(side)}>
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
