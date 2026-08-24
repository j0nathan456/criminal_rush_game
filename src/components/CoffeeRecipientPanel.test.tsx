import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import { emptyGameState } from '../engine';
import { CoffeeRecipientPanel } from './CoffeeRecipientPanel';

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

describe('<CoffeeRecipientPanel />', () => {
  it('offers the buyer and each teammate — clicking one resolves immediately', () => {
    const onResolve = vi.fn();
    const buyer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const opponent = mkPlayer({ id: 'p2', name: 'Cara', role: role('hitman', 'CRIMINAL') });
    const state = stateWith([buyer, mate, opponent], { pendingCoffeeRecipient: { playerId: 'p0' } });

    render(<CoffeeRecipientPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    expect(screen.getByText('Give the Coffee token to:')).toBeInTheDocument();
    expect(screen.getByText('Ana (you)')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Cara')).not.toBeInTheDocument(); // not a teammate

    fireEvent.click(screen.getByText('Ben'));
    expect(onResolve).toHaveBeenCalledWith('p1');
  });

  it('picking yourself resolves with your own id', () => {
    const onResolve = vi.fn();
    const buyer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([buyer], { pendingCoffeeRecipient: { playerId: 'p0' } });

    render(<CoffeeRecipientPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Ana (you)'));
    expect(onResolve).toHaveBeenCalledWith('p0');
  });

  it('shows a read-only waiting notice for viewers who are not the buyer', () => {
    const buyer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const state = stateWith([buyer, mate], { pendingCoffeeRecipient: { playerId: 'p0' } });

    render(<CoffeeRecipientPanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana to choose who gets the Coffee token/)).toBeInTheDocument();
    expect(screen.queryByText('Ben')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no pending choice', () => {
    const buyer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([buyer], { pendingCoffeeRecipient: null });

    const { container } = render(<CoffeeRecipientPanel state={state} viewerIndex={0} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
