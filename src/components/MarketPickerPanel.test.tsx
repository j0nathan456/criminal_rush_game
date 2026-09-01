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
const coffeeMachine: MarketCard = { id: 'cm', name: 'Coffee Machine', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
const expandNetwork: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };

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

  it('hides a card the viewer cannot afford, instead of offering a dead-end button', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 1 });
    const s = stateWith([viewer], { publicMarket: [computer] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Computer ($3)')).not.toBeInTheDocument();
    expect(screen.getByText("You can't afford anything here.")).toBeInTheDocument();
  });

  it('shows only what the viewer can afford when the Market has a mix', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 2 });
    const cheap: MarketCard = { id: 'm2', name: 'Cheap', description: '', cost: 1, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([viewer], { publicMarket: [computer, cheap] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Cheap ($1)')).toBeInTheDocument();
    expect(screen.queryByText('Computer ($3)')).not.toBeInTheDocument();
  });

  it('hides any weapon once the viewer already holds the max (2) — there is nowhere for a third to go', () => {
    const axe: MarketCard = { id: 'w1', name: 'Axe', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 3 };
    const bat: MarketCard = { id: 'w2', name: 'Bat', description: '', cost: 2, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 10, inventory: [axe, bat] });
    const newWeapon: MarketCard = { id: 'm3', name: 'Arrows', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 2 };
    const s = stateWith([viewer], { publicMarket: [computer, newWeapon] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    // A perk is still offered — only the weapon slot is full.
    expect(screen.getByText('Computer ($3)')).toBeInTheDocument();
    expect(screen.queryByText('Arrows ($3)')).not.toBeInTheDocument();
  });

  it('still offers a weapon with only 1 held — the cap is 2, not 1', () => {
    const bat: MarketCard = { id: 'w2', name: 'Bat', description: '', cost: 2, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 10, inventory: [bat] });
    const newWeapon: MarketCard = { id: 'm3', name: 'Arrows', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 2 };
    const s = stateWith([viewer], { publicMarket: [newWeapon] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Arrows ($3)')).toBeInTheDocument();
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

  it('never lists Expand Network — it has its own dedicated Action button now, not the Buy picker', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ben', role: role('crime-lord', 'CRIMINAL'), money: 9 });
    const s = stateWith([viewer], { blackMarket: [expandNetwork, pistol] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Black Market'));
    expect(screen.queryByText(/Expand Network/)).not.toBeInTheDocument();
    expect(screen.getByText('Pistol ($2)')).toBeInTheDocument(); // other Black Market items are unaffected
  });
});

describe('<MarketPickerPanel /> — Coffee Machine', () => {
  it('buys it the same as any other card — who gets the token is a separate follow-up step (see CoffeeRecipientPanel), not gathered here', () => {
    const onBuy = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 5 });
    const s = stateWith([viewer], { publicMarket: [coffeeMachine] });
    render(<MarketPickerPanel state={s} viewerIndex={0} onBuy={onBuy} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('Coffee Machine ($3)'));
    expect(onBuy).toHaveBeenCalledWith(coffeeMachine);
    expect(screen.queryByText('Give the Coffee token to:')).not.toBeInTheDocument();
  });
});
