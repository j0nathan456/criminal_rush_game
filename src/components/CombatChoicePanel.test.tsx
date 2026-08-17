import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity, CombatState } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { CombatChoicePanel } from './CombatChoicePanel';

function role(id: string, team: RoleIdentity['team']): RoleIdentity {
  return { id, name: id, team, powerlevel: 3, abilityName: '', abilityDescription: '' };
}
function mkPlayer(over: Partial<Player> & { id: string; name: string; role: RoleIdentity }): Player {
  return {
    team: over.role.team, hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const part = (playerId: string) => ({ playerId, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true });
function stateWith(players: Player[], combat: CombatState, over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, combat, ...over };
}

describe('<CombatChoicePanel />', () => {
  it('Portal: DRAW dispatches the draw choice', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'PRE', pending: [{ kind: 'PORTAL', playerId: 'a', weaponId: 'por', side: 'ATTACKER' }],
    };
    render(
      <CombatChoicePanel
        state={stateWith([holder, mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') })], combat)}
        viewerIndex={0}
        onCombatChoice={onCombatChoice}
      />,
    );
    fireEvent.click(screen.getByText('Draw 2 cards'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'PORTAL', mode: 'DRAW' });
  });

  it('Leaving Evidence: the injured defender picks a card and shuffles it back', () => {
    const onCombatChoice = vi.fn();
    const ev: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') }), def], combat, { discardPile: [ev] });
    render(<CombatChoicePanel state={state} viewerIndex={1} onCombatChoice={onCombatChoice} />);
    fireEvent.click(screen.getByText('Time Evidence'));
    fireEvent.click(screen.getByText('Shuffle 1 back'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'LEAVING_EVIDENCE', evidenceIds: ['t1'] });
  });

  it('Drones: the holder never sees the teammate\'s hand — only their own card and a name to pick', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL'), hand: [{ id: 'mine', name: 'MyCard', description: '', type: 'MONEY' }] });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES', playerId: 'a', weaponId: 'dr', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={0} onCombatChoice={onCombatChoice} />);

    fireEvent.click(screen.getByText('MyCard'));
    fireEvent.click(screen.getByText('Sal'));
    expect(screen.queryByText('TheirCard')).not.toBeInTheDocument(); // never revealed to the holder

    fireEvent.click(screen.getByText('Exchange'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' });
  });

  it('Drones: the responding teammate picks from their own hand for the return', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES_RETURN', playerId: 'm', holderId: 'a', holderCardId: 'mine', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={2} onCombatChoice={onCombatChoice} />);

    expect(screen.getByText(/Mona/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('TheirCard'));
    fireEvent.click(screen.getByText('Give card'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'DRONES_RETURN', cardId: 'theirs' });
  });

  it('Drones: everyone else sees a read-only waiting notice during the return step', () => {
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES_RETURN', playerId: 'm', holderId: 'a', holderCardId: 'mine', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={0} />);
    expect(screen.getByText(/Waiting for Sal to choose a card to give back to Mona/)).toBeInTheDocument();
    expect(screen.queryByText('TheirCard')).not.toBeInTheDocument();
  });

  it('Leaving Evidence: hovering a card shows the categories it counts toward', () => {
    const ev: ActionCard = {
      id: 'ch1', name: 'Casino Heist', description: '', type: 'EVIDENCE', evidenceCategories: ['MOTIVE', 'LOCATION'],
    };
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') }), def], combat, { discardPile: [ev] });

    render(<CombatChoicePanel state={state} viewerIndex={1} />);
    expect(screen.getByText('Casino Heist').closest('button')).toHaveAttribute('title', 'Motive, Location');
  });

  it("Leaving Evidence: everyone but the injured defender sees a read-only waiting notice, not the picker", () => {
    const onCombatChoice = vi.fn();
    const ev: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([attacker, def], combat, { discardPile: [ev] });

    // The attacker (e.g. a Criminal who just injured the defender) is not the decider.
    render(<CombatChoicePanel state={state} viewerIndex={0} onCombatChoice={onCombatChoice} />);
    expect(screen.getByText(/waiting for dee/i)).toBeInTheDocument();
    expect(screen.queryByText('Time Evidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });
});
