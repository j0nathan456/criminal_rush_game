import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { PerkPickerPanel } from './PerkPickerPanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const perk = (id: string, name: string): MarketCard => ({ id, name, description: 'perk', cost: 2, source: 'PUBLIC', type: 'PERK' });

describe('<PerkPickerPanel />', () => {
  it('offers only actionable, not-yet-used perks', () => {
    const viewer = mkPlayer({
      id: 'p0', name: 'Ana',
      inventory: [perk('b', 'Bank'), perk('m', 'Mafia Alliance'), perk('c', 'Credit Card')],
      usedPerkIds: ['c'],
    });
    render(<PerkPickerPanel viewer={viewer} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Bank')).toBeInTheDocument();
    expect(screen.queryByText('Mafia Alliance')).not.toBeInTheDocument(); // not actionable
    expect(screen.queryByText('Credit Card')).not.toBeInTheDocument(); // already used this turn
  });

  it('shows an empty message when nothing is usable', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('m', 'Mafia Alliance')] });
    render(<PerkPickerPanel viewer={viewer} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/No actionable perks available/)).toBeInTheDocument();
  });

  it('calls onSelect with the chosen perk id', () => {
    const onSelect = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('b', 'Bank'), perk('cc', 'Coffee Machine')] });
    render(<PerkPickerPanel viewer={viewer} onSelect={onSelect} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Coffee Machine'));
    expect(onSelect).toHaveBeenCalledWith('cc');
  });
});
