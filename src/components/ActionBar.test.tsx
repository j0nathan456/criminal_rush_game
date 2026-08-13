import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import type { Team } from '../types/cards';
import { ActionBar } from './ActionBar';

function makePlayer(team: Team, actionsRemaining: number): Player {
  const role: RoleIdentity = {
    id: 'r', name: 'Tester', team, powerlevel: 3,
    abilityName: 'A', abilityDescription: 'desc',
  };
  return {
    id: 'p', name: 'Test', team, role, hand: [], inventory: [], money: 5,
    actionsRemaining, hasPurchasedFromMarket: false, hasUsedRoleAbility: false,
    powerLevel: role.powerlevel, isInjured: false, isExposed: false, isCaptured: false,
  };
}

describe('<ActionBar />', () => {
  it('shows the Civilian-only Expose action, not Expand Network', () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={() => {}} />);
    expect(screen.getByText('Expose')).toBeInTheDocument();
    expect(screen.queryByText('Expand Network')).not.toBeInTheDocument();
  });

  it('shows the Criminal-only Expand Network action, not Expose', () => {
    render(<ActionBar player={makePlayer('CRIMINAL', 3)} onAction={() => {}} />);
    expect(screen.getByText('Expand Network')).toBeInTheDocument();
    expect(screen.queryByText('Expose')).not.toBeInTheDocument();
  });

  it('disables Combat (2 AP) when the player has fewer than 2 actions left', () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 1)} onAction={() => {}} />);
    expect(screen.getByText('Combat').closest('button')).toBeDisabled();
    expect(screen.getByText('Draw').closest('button')).not.toBeDisabled();
  });

  it('fires onAction with the chosen action and onEndTurn on end turn', () => {
    const onAction = vi.fn();
    const onEndTurn = vi.fn();
    render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={onAction} onEndTurn={onEndTurn} />);

    fireEvent.click(screen.getByText('Draw').closest('button')!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'DRAW_CARD', cost: 1 }));

    fireEvent.click(screen.getByText(/End Turn/).closest('button')!);
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });
});
