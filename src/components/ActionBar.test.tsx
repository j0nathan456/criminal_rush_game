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

  it('shows Trade at 0 AP, not 1, for a Radio holder who has not used it this turn', () => {
    const withRadio = {
      ...makePlayer('CIVILIAN', 3),
      inventory: [{ id: 'r', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={withRadio} onAction={() => {}} />);
    const tradeButton = screen.getByText('Trade').closest('button')!;
    expect(within(tradeButton).getByText('0 AP')).toBeInTheDocument();
    expect(within(tradeButton).queryByText('1 AP')).not.toBeInTheDocument();
  });

  it("lets a Radio holder trade at 0 AP — Radio's discount, not the flat base price, gates the button", () => {
    const withRadio = {
      ...makePlayer('CIVILIAN', 0),
      inventory: [{ id: 'r', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={withRadio} onAction={() => {}} />);
    expect(screen.getByText('Trade').closest('button')).not.toBeDisabled();
  });

  it('keeps Trade at 1 AP for a Radio holder who already used the discount this turn', () => {
    const usedRadio = {
      ...makePlayer('CIVILIAN', 0),
      inventory: [{ id: 'r', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const }],
      hasUsedRadio: true,
    };
    render(<ActionBar player={usedRadio} onAction={() => {}} />);
    expect(screen.getByText('Trade').closest('button')).toBeDisabled();
  });

  it("still charges a Radio holder snarled by a Traffic token the full 1 AP, not 0", () => {
    const snarledRadio = {
      ...makePlayer('CIVILIAN', 0),
      inventory: [{ id: 'r', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const }],
      trafficToken: true,
    };
    render(<ActionBar player={snarledRadio} onAction={() => {}} />);
    const tradeButton = screen.getByText('Trade').closest('button')!;
    expect(within(tradeButton).getByText('1 AP')).toBeInTheDocument();
    expect(tradeButton).toBeDisabled();
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

  it('shows Combat at 1 AP, not 2, once the player holds a Getaway Car', () => {
    const withCar = {
      ...makePlayer('CIVILIAN', 3),
      inventory: [{ id: 'gc', name: 'Getaway Car', description: '', cost: 3, source: 'BLACK_MARKET' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={withCar} onAction={() => {}} />);
    const combatButton = screen.getByText('Combat').closest('button')!;
    expect(within(combatButton).getByText('1 AP')).toBeInTheDocument();
    expect(within(combatButton).queryByText('2 AP')).not.toBeInTheDocument();
  });

  it("lets a Getaway Car holder attack with just 1 action left — the discounted cost, not the flat base price, gates the button", () => {
    const withCar = {
      ...makePlayer('CIVILIAN', 1),
      inventory: [{ id: 'gc', name: 'Getaway Car', description: '', cost: 3, source: 'BLACK_MARKET' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={withCar} onAction={() => {}} />);
    expect(screen.getByText('Combat').closest('button')).not.toBeDisabled();
  });

  it('disables Perk Action at 0 AP when the only usable perk is a paid one', () => {
    const player = {
      ...makePlayer('CIVILIAN', 0),
      inventory: [{ id: 'bank', name: 'Bank', description: '', cost: 3, source: 'PUBLIC' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={player} availability={{ PERK_ACTION: { enabled: true } }} onAction={() => {}} />);
    expect(screen.getByText('Perk Action').closest('button')).toBeDisabled();
  });

  it('keeps Perk Action enabled at 0 AP when a Water Bottle is usable, since it costs nothing', () => {
    const player = {
      ...makePlayer('CIVILIAN', 0),
      inventory: [{ id: 'wb', name: 'Water Bottle', description: '', cost: 1, source: 'PUBLIC' as const, type: 'PERK' as const }],
    };
    render(<ActionBar player={player} availability={{ PERK_ACTION: { enabled: true } }} onAction={() => {}} />);
    expect(screen.getByText('Perk Action').closest('button')).not.toBeDisabled();
  });

  it("shows how to actually Play/Sell instead of a role description, since clicking these buttons doesn't do it directly", () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={() => {}} />);
    expect(screen.getByText('Choose card directly from hand')).toBeInTheDocument();
    expect(screen.getByText('Sell from perks directly')).toBeInTheDocument();
  });

  it("doesn't give Play Card/Sell the same hover-to-click affordance as a real one-click action", () => {
    render(<ActionBar player={makePlayer('CIVILIAN', 3)} onAction={() => {}} />);
    const playButton = screen.getByText('Play Card').closest('button')!;
    const sellButton = screen.getByText('Sell').closest('button')!;
    const drawButton = screen.getByText('Draw').closest('button')!;
    expect(playButton.className).not.toContain('hover:border-amber');
    expect(sellButton.className).not.toContain('hover:border-amber');
    expect(drawButton.className).toContain('hover:border-amber'); // a real one-click action keeps it
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
