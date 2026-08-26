import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { AllySupportPanel } from './AllySupportPanel';

function role(id: string, name: string, abilityName: string): RoleIdentity {
  return { id, name, team: 'CIVILIAN', powerlevel: 3, abilityName, abilityDescription: 'desc' };
}
function mkPlayer(over: Partial<Player> & { id: string; name: string; role: RoleIdentity }): Player {
  return {
    team: 'CIVILIAN', hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const perk = (id: string, name: string): MarketCard => ({ id, name, description: '', cost: 2, source: 'PUBLIC', type: 'PERK' });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<AllySupportPanel />', () => {
  it('copies a teammate’s role Action, producing an allyPayload', () => {
    const onSubmit = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'Mayor', 'City Hall') });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('collector', 'Collector', 'Commission') });
    const s = stateWith([actor, mate], { publicMarket: [perk('m1', 'Computer')] });

    render(<AllySupportPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Bo')); // pick teammate
    fireEvent.click(screen.getByText('Commission (role)')); // copy their role Action
    fireEvent.click(screen.getByText('Computer ($2)')); // Collector buys from Market
    fireEvent.click(screen.getByText('Copy this Action'));

    expect(onSubmit).toHaveBeenCalledWith('p1', { allyPayload: { targetId: undefined, cardId: 'm1', category: undefined, mode: undefined } });
  });

  it('offers the actor themself as a target, labeled "(yourself)", to reuse their own Action', () => {
    const onSubmit = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('collector', 'Collector', 'Commission') });
    const s = stateWith([actor], { publicMarket: [perk('m1', 'Computer')] });

    render(<AllySupportPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Ana (yourself)'));
    fireEvent.click(screen.getByText('Commission (role)'));
    fireEvent.click(screen.getByText('Computer ($2)'));
    fireEvent.click(screen.getByText('Copy this Action'));

    expect(onSubmit).toHaveBeenCalledWith('p0', { allyPayload: { targetId: undefined, cardId: 'm1', category: undefined, mode: undefined } });
  });

  it('lists a teammate’s actionable perk to copy', () => {
    const onSubmit = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'Mayor', 'City Hall') });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('sheriff', 'Sheriff', 'Subpoena'), inventory: [perk('wb', 'Water Bottle')] });
    const s = stateWith([actor, mate]);

    render(<AllySupportPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Bo'));
    // Both the role Action and the actionable perk are offered.
    expect(screen.getByText('Subpoena (role)')).toBeInTheDocument();
    expect(screen.getByText('Water Bottle')).toBeInTheDocument();
  });
});
