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

  it('Credit Card: the button shows the discounted price, not the base cost, and updates when the $2-off box is checked', () => {
    const onSubmit = vi.fn();
    const p = mkPlayer({ id: 'p0', name: 'Ana', inventory: [perk('cc', 'Credit Card')] });
    render(
      <PerkActionPanel state={stateWith([p], { publicMarket: [perk('shop', 'Computer')] })} viewerIndex={0} perkId="cc" onSubmit={onSubmit} onCancel={() => {}} />,
    );
    expect(screen.queryByText('Computer ($3)')).not.toBeInTheDocument(); // never the raw cost
    fireEvent.click(screen.getByText('Computer ($2)')); // $3 base - $1 off
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('cc', expect.objectContaining({ marketCardId: 'shop', discardForBonus: false }));

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Computer ($1)')).toBeInTheDocument(); // $3 base - $2 off
  });

  it('Credit Card: a captured Criminal sees the Weakened Network surcharge on Expand Network stack with the discount', () => {
    const crimRole: RoleIdentity = { id: 'crime-lord', name: 'Crime Lord', team: 'CRIMINAL', powerlevel: 4, abilityName: '', abilityDescription: '' };
    const expandNetwork: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const p = mkPlayer({ id: 'p0', name: 'Ben', team: 'CRIMINAL', role: crimRole, isCaptured: true, inventory: [perk('cc', 'Credit Card')] });
    render(
      <PerkActionPanel state={stateWith([p], { blackMarket: [expandNetwork] })} viewerIndex={0} perkId="cc" onSubmit={vi.fn()} onCancel={() => {}} />,
    );
    // $5 base + $1 surcharge (captured) - $1 discount (Credit Card) = $5, not the naive $4.
    expect(screen.queryByText('Expand Network ($4)')).not.toBeInTheDocument();
    expect(screen.getByText('Expand Network ($5)')).toBeInTheDocument();
  });

  it('Shady Press: pick an opponent, then one of their (no-input) Event cards', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', team: 'CRIMINAL', inventory: [perk('sp', 'Shady Press')] });
    const opponent = mkPlayer({ id: 'p1', name: 'Ben', team: 'CIVILIAN', hand: [evt] });
    render(<PerkActionPanel state={stateWith([viewer, opponent])} viewerIndex={0} perkId="sp" onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByText('Use').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Ben'));
    expect(screen.getByText('Use').closest('button')).toBeDisabled(); // still need a card choice
    fireEvent.click(screen.getByText('Generational Wealth'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('sp', expect.objectContaining({ targetId: 'p1', cardId: 'e1' }));
  });

  it('Shady Press: a configurable Event opens its own follow-up, gathered from the presser', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Tax Collection', description: '', type: 'EVENT' };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', team: 'CRIMINAL', inventory: [perk('sp', 'Shady Press')] });
    const victim = mkPlayer({ id: 'p1', name: 'Ben', team: 'CIVILIAN', hand: [evt] });
    const taxable = mkPlayer({ id: 'p2', name: 'Cara', team: 'CIVILIAN', money: 3 });
    render(
      <PerkActionPanel state={stateWith([viewer, victim, taxable])} viewerIndex={0} perkId="sp" onSubmit={onSubmit} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Tax Collection'));

    // Now Tax Collection's own follow-up appears, asking Ana (the presser) to
    // choose who it taxes — not Ben, who merely supplied the card.
    expect(screen.getByText('Play Tax Collection').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Cara'));
    fireEvent.click(screen.getByText('Play Tax Collection'));
    expect(onSubmit).toHaveBeenCalledWith(
      'sp',
      expect.objectContaining({ targetId: 'p1', cardId: 'e1', eventTargetId: 'p2' }),
    );
  });

  it('Shady Press: an opponent with no Event cards can still be confirmed (wastes the action)', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', team: 'CRIMINAL', inventory: [perk('sp', 'Shady Press')] });
    const opponent = mkPlayer({ id: 'p1', name: 'Ben', team: 'CIVILIAN', hand: [money('m1')] });
    render(<PerkActionPanel state={stateWith([viewer, opponent])} viewerIndex={0} perkId="sp" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('sp', expect.objectContaining({ targetId: 'p1', cardId: undefined }));
  });

  it("Shady Press: the victim's only Event is Business Opportunity and the presser has nothing to sell — discards it instead of getting stuck", () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Business Opportunity', description: '', type: 'EVENT' };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', team: 'CRIMINAL', inventory: [perk('sp', 'Shady Press')] }); // nothing else to sell
    const victim = mkPlayer({ id: 'p1', name: 'Ben', team: 'CIVILIAN', hand: [evt] });
    render(
      <PerkActionPanel state={stateWith([viewer, victim])} viewerIndex={0} perkId="sp" onSubmit={onSubmit} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Business Opportunity'));

    // No way to configure a sale (nothing sellable) — Play stays unreachable,
    // but there's an explicit way forward instead of being stuck.
    expect(screen.queryByRole('button', { name: /Play Business Opportunity/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Discard Business Opportunity/));
    expect(onSubmit).toHaveBeenCalledWith('sp', { targetId: 'p1', cardId: 'e1', eventTargetId: undefined, eventOptions: {} });
  });
});
