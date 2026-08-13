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
    render(<CombatPanel state={combatState()} />);
    expect(screen.getByText('⚔️ Combat — Power phase')).toBeInTheDocument();
    expect(screen.getByText('Mona')).toBeInTheDocument();
    expect(screen.getByText('Dora')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // attacker total
  });

  it('plays a Power card and passes via the handlers', () => {
    const onPlayPower = vi.fn();
    const onPassCombat = vi.fn();
    render(<CombatPanel state={combatState()} onPlayPower={onPlayPower} onPassCombat={onPassCombat} />);

    fireEvent.click(screen.getByText('Boost'));
    expect(onPlayPower).toHaveBeenCalledWith('b1', 'ATTACKER', 'atk');

    fireEvent.click(screen.getAllByText('Pass')[0]);
    expect(onPassCombat).toHaveBeenCalledWith('ATTACKER');
  });

  it('renders nothing when there is no combat', () => {
    const { container } = render(<CombatPanel state={emptyGameState()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
