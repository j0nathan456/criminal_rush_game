import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { GetawayCarPanel } from './GetawayCarPanel';

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
function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<GetawayCarPanel />', () => {
  it('asks yes/no, then walks the actor through teammate and card pickers, dispatching only once at the end', () => {
    const onResolve = vi.fn();
    const gift: ActionCard = { id: 'h1', name: 'Boost', description: '+1 PL', type: 'POWER', power: 1 };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [gift] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const state = stateWith([actor, mate], { pendingGetawayCarGift: { playerId: 'p0' } });

    render(<GetawayCarPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    expect(screen.getByText('🚗 Give teammate Getaway Car?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes'));
    expect(screen.getByText('🚗 Give it to…')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ben'));
    expect(screen.getByText('🚗 Choose a card for Ben')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Boost'));
    expect(onResolve).toHaveBeenCalledWith(true, 'p1', 'h1');
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('resolves immediately on No, with no teammate or card picker shown', () => {
    const onResolve = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], { pendingGetawayCarGift: { playerId: 'p0' } });

    render(<GetawayCarPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('No'));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it('lets the actor back out of the teammate and card stages without dispatching', () => {
    const onResolve = vi.fn();
    const gift: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [gift] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const state = stateWith([actor, mate], { pendingGetawayCarGift: { playerId: 'p0' } });

    render(<GetawayCarPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Yes'));
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('🚗 Give it to…')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('🚗 Give teammate Getaway Car?')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('shows a read-only waiting notice for viewers who are not the actor', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const viewer = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const state = stateWith([actor, viewer], { pendingGetawayCarGift: { playerId: 'p0' } });

    render(<GetawayCarPanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana to decide/)).toBeInTheDocument();
    expect(screen.queryByText('Yes')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no pending offer', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], { pendingGetawayCarGift: null });

    const { container } = render(<GetawayCarPanel state={state} viewerIndex={0} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
