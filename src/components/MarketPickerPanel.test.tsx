import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { MarketPickerPanel } from './MarketPickerPanel';

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
const computer: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
const pistol: MarketCard = { id: 'b1', name: 'Pistol', description: '', cost: 2, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'RANGED', power: 3 };

describe('<MarketPickerPanel /> — Civilian', () => {
  it('goes straight to the public Market, skipping the source choice', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [computer] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Computer ($3)')).toBeInTheDocument();
    expect(screen.queryByText('Black Market')).not.toBeInTheDocument();
  });

  it('buying a card calls onBuy with it', () => {
    const onBuy = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [computer] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={onBuy} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Computer ($3)'));
    expect(onBuy).toHaveBeenCalledWith(computer);
  });

  it('disables a card the viewer cannot afford', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 1 });
    const s = stateWith([viewer], { publicMarket: [computer] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Computer ($3)')).toBeDisabled();
  });
});

describe('<MarketPickerPanel /> — Criminal', () => {
  it('asks Market or Black Market first', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ben', role: role('hitman', 'CRIMINAL'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [computer], blackMarket: [pistol] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Which Market?')).toBeInTheDocument();
    expect(screen.queryByText('Computer ($3)')).not.toBeInTheDocument();
    expect(screen.queryByText('Pistol ($2)')).not.toBeInTheDocument();
  });

  it('choosing Black Market lists its cards, not the public Market', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ben', role: role('hitman', 'CRIMINAL'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [computer], blackMarket: [pistol] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Black Market'));
    expect(screen.getByText('Pistol ($2)')).toBeInTheDocument();
    expect(screen.queryByText('Computer ($3)')).not.toBeInTheDocument();
  });

  it('Back returns to the Market/Black Market choice', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ben', role: role('hitman', 'CRIMINAL'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [computer], blackMarket: [pistol] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Market'));
    expect(screen.getByText('Computer ($3)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Which Market?')).toBeInTheDocument();
  });
});
