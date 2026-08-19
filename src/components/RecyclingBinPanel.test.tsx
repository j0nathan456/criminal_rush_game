import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { RecyclingBinPanel } from './RecyclingBinPanel';

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

describe('<RecyclingBinPanel /> — TAKE phase', () => {
  it('lists every same-type discard card, hoverable for a description, excluding the just-discarded one', () => {
    const onResolve = vi.fn();
    const oldPower: ActionCard = { id: 'd1', name: 'Surge', description: '+2 PL during combat.', type: 'POWER', power: 2 };
    const otherPower: ActionCard = { id: 'd2', name: 'Boost', description: '+1 PL during combat.', type: 'POWER', power: 1 };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], {
      discardPile: [oldPower, otherPower, { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 }],
      pendingRecyclingBin: { playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'TAKE' },
    });
    render(<RecyclingBinPanel state={state} viewerIndex={0} onResolve={onResolve} />);

    const surgeButton = screen.getByText('Surge').closest('button');
    expect(surgeButton).toHaveAttribute('title', 'Surge — +2 PL during combat.');
    // Only 2 candidates (both real discard Power cards) — the just-discarded card itself isn't offered.
    expect(screen.getAllByRole('button')).toHaveLength(2);

    fireEvent.click(screen.getByText('Surge'));
    expect(onResolve).toHaveBeenCalledWith('d1', undefined);
  });

  it('shows a "can\'t use it" message and a Continue button when nothing matches', () => {
    const onResolve = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], {
      discardPile: [{ id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 }],
      pendingRecyclingBin: { playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'TAKE' },
    });
    render(<RecyclingBinPanel state={state} viewerIndex={0} onResolve={onResolve} />);

    expect(screen.getByText(/you can't use the Recycling Bin on this card/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue'));
    expect(onResolve).toHaveBeenCalledWith(undefined, undefined);
  });

  it('shows a read-only waiting notice for viewers who aren\'t the one using the Recycling Bin', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const viewer = mkPlayer({ id: 'p1', name: 'Ben', role: role('sheriff', 'CIVILIAN') });
    const state = stateWith([actor, viewer], {
      pendingRecyclingBin: { playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'TAKE' },
    });
    render(<RecyclingBinPanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana to recycle a card/)).toBeInTheDocument();
  });
});

describe('<RecyclingBinPanel /> — REWARD phase', () => {
  it('offers $1 or a draw', () => {
    const onResolve = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], {
      pendingRecyclingBin: { playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'REWARD' },
    });
    render(<RecyclingBinPanel state={state} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Draw a card'));
    expect(onResolve).toHaveBeenCalledWith(undefined, 'DRAW');

    fireEvent.click(screen.getByText('Gain $1'));
    expect(onResolve).toHaveBeenCalledWith(undefined, 'MONEY');
  });
});
