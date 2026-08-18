import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { MarketDiscountPanel } from './MarketDiscountPanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const perk = (id: string, name: string, cost = 3): MarketCard => ({ id, name, description: 'perk', cost, source: 'PUBLIC', type: 'PERK' });
const weapon = (id: string, name: string, cost = 4): MarketCard => ({ id, name, description: 'weapon', cost, source: 'PUBLIC', type: 'WEAPON' });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<MarketDiscountPanel />', () => {
  it('offers only perks from the Market, not weapons', () => {
    const p = mkPlayer({ id: 'p0', name: 'Ana' });
    render(
      <MarketDiscountPanel
        state={stateWith([p], { publicMarket: [perk('pk', 'Computer'), weapon('wp', 'Bat')] })}
        viewerIndex={0}
        amount={1}
        onBuy={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/Computer/)).toBeInTheDocument();
    expect(screen.queryByText(/Bat/)).not.toBeInTheDocument();
  });

  it('shows an empty message when the Market has no perks, even if it has weapons', () => {
    const p = mkPlayer({ id: 'p0', name: 'Ana' });
    render(
      <MarketDiscountPanel
        state={stateWith([p], { publicMarket: [weapon('wp', 'Bat')] })}
        viewerIndex={0}
        amount={1}
        onBuy={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/No perks in the Market/)).toBeInTheDocument();
  });

  it('calls onBuy with the discounted perk id', () => {
    const onBuy = vi.fn();
    const p = mkPlayer({ id: 'p0', name: 'Ana' });
    render(
      <MarketDiscountPanel
        state={stateWith([p], { publicMarket: [perk('pk', 'Computer')] })}
        viewerIndex={0}
        amount={1}
        onBuy={onBuy}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Computer/));
    expect(onBuy).toHaveBeenCalledWith('pk');
  });
});
