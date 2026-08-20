import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { RoleCard } from './RoleCard';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: 'Extra Action', abilityDescription: '+1 action per turn.' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const perk = (id: string, name: string, description: string): MarketCard => ({ id, name, description, cost: 3, source: 'PUBLIC', type: 'PERK' });

describe('<RoleCard />', () => {
  it('shows a "name — description" tooltip on the perk name, matching the Market card hover', () => {
    const player = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('b', 'Bank', 'Action: play a Money card for +$1 value and draw a card.')] });
    render(<RoleCard player={player} />);
    expect(screen.getByText(/Bank/).closest('span')).toHaveAttribute(
      'title',
      'Bank — Action: play a Money card for +$1 value and draw a card.',
    );
  });

  it('no longer shows an inline "Use" button — perks are activated via the Action Bar instead', () => {
    const player = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('b', 'Bank', 'desc')] });
    render(<RoleCard player={player} canManageItems onSell={vi.fn()} />);
    expect(screen.queryByText('Use')).not.toBeInTheDocument();
    expect(screen.getByText('Sell $1')).toBeInTheDocument();
  });

  it('calls onSell when the Sell button is clicked', () => {
    const onSell = vi.fn();
    const item = perk('b', 'Bank', 'desc');
    const player = mkPlayer({ id: 'p0', name: 'Ana', inventory: [item] });
    render(<RoleCard player={player} canManageItems onSell={onSell} />);
    fireEvent.click(screen.getByText('Sell $1'));
    expect(onSell).toHaveBeenCalledWith(item);
  });

  it('does not truncate a long item name even with the Sell button present — it wraps to its own line instead', () => {
    const weapon: MarketCard = {
      id: 'w', name: 'Corrosion Cannisters', description: 'desc', cost: 4, source: 'PUBLIC',
      type: 'WEAPON', weaponType: 'CHEMICAL', power: 2,
    };
    const player = mkPlayer({ id: 'p0', name: 'Ana', inventory: [weapon] });
    render(<RoleCard player={player} canManageItems onSell={vi.fn()} />);

    const nameSpan = screen.getByText(/Corrosion Cannisters/);
    expect(nameSpan).not.toHaveClass('truncate');
    expect(screen.getByText('Sell $1')).toBeInTheDocument();
  });
});
