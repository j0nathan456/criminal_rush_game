import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { CombatPanel } from './CombatPanel';

function role(id: string, team: RoleIdentity['team'], powerlevel = 3): RoleIdentity {
  return { id, name: id, team, powerlevel, abilityName: '', abilityDescription: '' };
}
function mkPlayer(over: Partial<Player> & { id: string; name: string; role: RoleIdentity }): Player {
  return {
    team: over.role.team, hand: [], inventory: [], money: 5, powerLevel: over.role.powerlevel,
    actionsRemaining: 3, hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const boost = (id: string): ActionCard => ({ id, name: 'Boost', description: '', type: 'POWER', power: 1 });

function combatState(): GameState {
  const attacker = mkPlayer({ id: 'atk', name: 'Mona', role: role('hitman', 'CRIMINAL', 3), hand: [boost('b1')] });
  const defender = mkPlayer({ id: 'def', name: 'Dora', role: role('mayor', 'CIVILIAN', 2) });
  return {
    ...emptyGameState(),
    players: [attacker, defender],
    combat: {
      attacker: { playerId: 'atk', basePower: 5, powerCardBonus: 0, passed: false, canPlayPower: true },
      defender: { playerId: 'def', basePower: 2, powerCardBonus: 0, passed: false, canPlayPower: true },
      turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2, phase: 'POWER', pending: [],
    },
  };
}

describe('<CombatPanel />', () => {
  it('shows both combatants with their power totals', () => {
    render(<CombatPanel state={combatState()} viewerIndex={0} />);
    expect(screen.getByText('⚔️ Combat — Power phase')).toBeInTheDocument();
    expect(screen.getByText('Mona')).toBeInTheDocument();
    expect(screen.getByText('Dora')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // attacker total
  });

  it('plays a Power card and passes via the handlers', () => {
    const onPlayPower = vi.fn();
    const onPassCombat = vi.fn();
    render(<CombatPanel state={combatState()} viewerIndex={0} onPlayPower={onPlayPower} onPassCombat={onPassCombat} />);

    fireEvent.click(screen.getByText('Boost'));
    expect(onPlayPower).toHaveBeenCalledWith('b1', 'ATTACKER', 'atk');

    fireEvent.click(screen.getAllByText('Pass')[0]);
    expect(onPassCombat).toHaveBeenCalledWith('ATTACKER');
  });

  it('only lets a combatant pass for their own side, not their opponent’s', () => {
    const onPassCombat = vi.fn();
    // Viewer 0 is the attacker (Mona).
    render(<CombatPanel state={combatState()} viewerIndex={0} onPassCombat={onPassCombat} />);
    const [attackerPass, defenderPass] = screen.getAllByText('Pass').map((el) => el.closest('button')!);
    expect(attackerPass).toBeEnabled(); // Mona may pass for herself

    fireEvent.click(defenderPass); // disabled — clicking does nothing
    expect(defenderPass).toBeDisabled();
    expect(onPassCombat).not.toHaveBeenCalledWith('DEFENDER');
  });

  it('renders nothing when there is no combat', () => {
    const { container } = render(<CombatPanel state={emptyGameState()} viewerIndex={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never offers a teammate’s Power card for a play they are not allowed to make', () => {
    const attacker = mkPlayer({ id: 'atk', name: 'Mona', role: role('hitman', 'CRIMINAL', 3) });
    const defender = mkPlayer({ id: 'def', name: 'Dora', role: role('mayor', 'CIVILIAN', 2) });
    const mate: ActionCard = { id: 'b2', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const teammate = mkPlayer({ id: 'mate', name: 'Nia', role: role('attorney', 'CIVILIAN', 3), team: 'CIVILIAN', hand: [mate] });
    const state: GameState = {
      ...emptyGameState(),
      players: [attacker, defender, teammate],
      combat: {
        attacker: { playerId: 'atk', basePower: 5, powerCardBonus: 0, passed: false, canPlayPower: true },
        defender: { playerId: 'def', basePower: 2, powerCardBonus: 0, passed: false, canPlayPower: true },
        turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3, phase: 'POWER', pending: [],
      },
    };
    render(<CombatPanel state={state} viewerIndex={0} />);
    // Nia's Boost is a legal card, but she's neither the defender nor their Bodyguard.
    expect(screen.queryByText("Nia's Power cards")).not.toBeInTheDocument();
  });

  it('only offers Mirror once someone else has played a Power card this combat, and opens a target picker', () => {
    const onPlayPower = vi.fn();
    const mirror: ActionCard = { id: 'mir', name: 'Mirror', description: '', type: 'POWER', power: 0 };
    const attacker = mkPlayer({ id: 'atk', name: 'Mona', role: role('hitman', 'CRIMINAL', 3), hand: [mirror] });
    const defender = mkPlayer({ id: 'def', name: 'Dora', role: role('mayor', 'CIVILIAN', 2) });
    const base: GameState = {
      ...emptyGameState(),
      players: [attacker, defender],
      combat: {
        attacker: { playerId: 'atk', basePower: 5, powerCardBonus: 0, passed: false, canPlayPower: true },
        defender: { playerId: 'def', basePower: 2, powerCardBonus: 2, passed: false, canPlayPower: true },
        turn: 'ATTACKER', played: [{ cardId: 'surge1', name: 'Surge', byPlayerId: 'def', side: 'DEFENDER', power: 2, basePower: 2 }],
        actionCost: 2, playerCount: 2, phase: 'POWER', pending: [],
      },
    };
    const { rerender } = render(<CombatPanel state={{ ...base, combat: { ...base.combat!, played: [] } }} viewerIndex={0} onPlayPower={onPlayPower} />);
    expect(screen.queryByText('Mirror')).not.toBeInTheDocument(); // nothing played yet

    rerender(<CombatPanel state={base} viewerIndex={0} onPlayPower={onPlayPower} />);
    fireEvent.click(screen.getByText('Mirror'));
    expect(onPlayPower).not.toHaveBeenCalled(); // opens the picker instead of dispatching immediately

    fireEvent.click(screen.getByText('Surge (+2)'));
    expect(onPlayPower).toHaveBeenCalledWith('mir', 'ATTACKER', 'atk', 'surge1');
  });
});
