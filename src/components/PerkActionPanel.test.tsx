import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { PerkActionPanel } from './PerkActionPanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const money = (id: string): ActionCard => ({ id, name: `Profit-${id}`, description: '', type: 'MONEY', value: 2 });
const perk = (id: string, name: string): MarketCard => ({ id, name, description: 'perk', cost: 3, source: 'PUBLIC', type: 'PERK' });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<PerkActionPanel />', () => {
  it('Bank: requires a Money card, then submits it', () => {
    const onSubmit = vi.fn();
    const p = mkPlayer({ id: 'p0', name: 'Ana', hand: [money('m1')], inventory: [perk('bank', 'Bank')] });
    render(<PerkActionPanel state={stateWith([p])} viewerIndex={0} perkId="bank" onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByText('Use').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Profit-m1'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('bank', { cardId: 'm1', marketCardId: undefined, targetId: undefined, discardForBonus: false });
  });

  it('Water Bottle: no input needed, submits immediately', () => {
    const onSubmit = vi.fn();
    const p = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('wb', 'Water Bottle')] });
    render(<PerkActionPanel state={stateWith([p])} viewerIndex={0} perkId="wb" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('wb', expect.objectContaining({}));
  });

  it('Credit Card: picks a Market card to buy at a discount', () => {
    const onSubmit = vi.fn();
    const p = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('cc', 'Credit Card')] });
    render(
      <PerkActionPanel state={stateWith([p], { publicMarket: [perk('shop', 'Computer')] })} viewerIndex={0} perkId="cc" onSubmit={onSubmit} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByText('Computer ($3)'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('cc', expect.objectContaining({ marketCardId: 'shop', discardForBonus: false }));
  });
});
