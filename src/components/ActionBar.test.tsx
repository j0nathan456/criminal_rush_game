import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import type { Team } from '../types/cards';
import { ActionBar } from './ActionBar';

function makePlayer(team: Team, actionsRemaining: number, roleId = 'r'): Player {
  const role: RoleIdentity = {
    id: roleId, name: 'Tester', team, powerlevel: 3,
    abilityName: 'Ability Name', abilityDescription: 'desc',
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

  it('shows the real Expand Network price on the button — clicking it buys immediately, no picker to show it in', () => {
    render(<ActionBar player={makePlayer('CRIMINAL', 3)} expandNetworkCost={5} onAction={() => {}} />);
    expect(screen.getByText('Expand Network ($5)')).toBeInTheDocument();
  });

  it('folds the $1 Weakened Network surcharge into that same price once captured, not a separate note', () => {
    const captured = { ...makePlayer('CRIMINAL', 3), isCaptured: true };
    render(<ActionBar player={captured} expandNetworkCost={6} onAction={() => {}} />);
    expect(screen.getByText('Expand Network ($6)')).toBeInTheDocument();
    expect(screen.queryByText(/\+\$1 more/)).not.toBeInTheDocument();
  });

  it('falls back to the plain label when no Expand Network card is available to price', () => {
    render(<ActionBar player={makePlayer('CRIMINAL', 3)} onAction={() => {}} />); // expandNetworkCost omitted
    expect(screen.getByText('Expand Network')).toBeInTheDocument();
  });

  it('flags the +1 AP Traffic token surcharge on Trade only while snarled', () => {
    const { rerender } = render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={() => {}} />);
    expect(screen.queryByText(/\+1 AP more/)).not.toBeInTheDocument();

    rerender(<ActionBar player={{ ...makePlayer('CIVILIAN', 3), trafficToken: true }} onAction={() => {}} />);
    expect(screen.getByText(/\+1 AP more/)).toBeInTheDocument();
  });

  it('shows Role Action for a role with a real Action (Crime Lord)', () => {
    render(<ActionBar player={makePlayer('CRIMINAL', 3, 'crime-lord')} onAction={() => {}} />);
    expect(screen.getByText('Ability Name')).toBeInTheDocument(); // the role's abilityName, not a generic label
  });

  it('omits Role Action entirely for a passive role (Mayor) — no action point to spend', () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 3, 'mayor')} onAction={() => {}} />);
    expect(screen.queryByText('Ability Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Role Action')).not.toBeInTheDocument();
  });

  it('disables Combat (2 AP) when the player has fewer than 2 actions left', () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 1)} onAction={() => {}} />);
    expect(screen.getByText('Combat').closest('button')).toBeDisabled();
    expect(screen.getByText('Draw').closest('button')).not.toBeDisabled();
  });

  it('fires onAction with the chosen action', () => {
    const onAction = vi.fn();
    render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={onAction} onEndTurn={() => {}} />);

    fireEvent.click(screen.getByText('Draw').closest('button')!);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'DRAW_CARD', cost: 1 }));
  });

  it('ends the turn immediately, with no confirmation, once every action is spent', () => {
    const onEndTurn = vi.fn();
    render(<ActionBar player={makePlayer('CIVILIAN', 0)} onEndTurn={onEndTurn} />);

    fireEvent.click(screen.getByText(/End Turn/).closest('button')!);
    expect(onEndTurn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation before ending a turn with unspent actions, and only ends it once confirmed', async () => {
    const onEndTurn = vi.fn();
    render(<ActionBar player={makePlayer('CIVILIAN', 2)} onEndTurn={onEndTurn} />);

    fireEvent.click(screen.getByText(/End Turn/).closest('button')!);
    expect(onEndTurn).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/You still have 2 actions left/)).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByText('End Turn'));
    expect(onEndTurn).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Cancel backs out of the confirmation without ending the turn', async () => {
    const onEndTurn = vi.fn();
    render(<ActionBar player={makePlayer('CIVILIAN', 1)} onEndTurn={onEndTurn} />);

    fireEvent.click(screen.getByText(/End Turn/).closest('button')!);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onEndTurn).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
