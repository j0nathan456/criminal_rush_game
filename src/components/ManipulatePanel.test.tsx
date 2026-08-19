import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { ManipulatePanel } from './ManipulatePanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'hitman', name: 'Hitman', team: 'CRIMINAL', powerlevel: 3, abilityName: '', abilityDescription: '' };
  return {
    team: 'CRIMINAL', role, hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const money = (id: string, name: string): ActionCard => ({ id, name, description: `${name} description`, type: 'MONEY', value: 1 });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<ManipulatePanel />', () => {
  it("shows a read-only waiting message for viewers who aren't the one using Manipulate", () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana' });
    const viewer = mkPlayer({ id: 'p1', name: 'Ben' });
    const state = stateWith([actor, viewer], {
      pendingManipulate: { playerId: 'p0', cards: [money('a', 'Coin A'), money('b', 'Coin B'), money('c', 'Coin C')], phase: 'KEEP' },
    });
    render(<ManipulatePanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana/)).toBeInTheDocument();
    expect(screen.queryByText('Coin A')).not.toBeInTheDocument();
  });

  it('KEEP phase: shows all 3 revealed cards and calls onResolve with the chosen one', () => {
    const onResolve = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana' });
    const state = stateWith([actor], {
      pendingManipulate: { playerId: 'p0', cards: [money('a', 'Coin A'), money('b', 'Coin B'), money('c', 'Coin C')], phase: 'KEEP' },
    });
    render(<ManipulatePanel state={state} viewerIndex={0} onResolve={onResolve} />);
    expect(screen.getByText(/Choose a card to keep/)).toBeInTheDocument();
    expect(screen.getByText('Coin A')).toBeInTheDocument();
    expect(screen.getByText('Coin B')).toBeInTheDocument();
    expect(screen.getByText('Coin C')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Coin B'));
    expect(onResolve).toHaveBeenCalledWith('b');
  });

  it('TOP phase: shows only the remaining 2 cards with the top-of-deck prompt', () => {
    const onResolve = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana' });
    const state = stateWith([actor], {
      pendingManipulate: { playerId: 'p0', cards: [money('a', 'Coin A'), money('c', 'Coin C')], phase: 'TOP' },
    });
    render(<ManipulatePanel state={state} viewerIndex={0} onResolve={onResolve} />);
    expect(screen.getByText(/Choose a card to put on top of the deck/)).toBeInTheDocument();
    expect(screen.getByText('Coin A')).toBeInTheDocument();
    expect(screen.getByText('Coin C')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Coin A'));
    expect(onResolve).toHaveBeenCalledWith('a');
  });
});
