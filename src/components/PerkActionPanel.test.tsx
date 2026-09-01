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

  it("Recycling Bin: only offers hand cards whose type already has a match in the discard — nothing to recycle a type into otherwise", () => {
    const onSubmit = vi.fn();
    const junk: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const orphan: ActionCard = { id: 'h2', name: 'Metal Chain', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const oldPower: ActionCard = { id: 'd1', name: 'Surge', description: '', type: 'POWER', power: 2 };
    const p = mkPlayer({ id: 'p0', name: 'Ana', hand: [junk, orphan], inventory: [perk('bin', 'Recycling Bin')] });
    render(
      <PerkActionPanel
        state={stateWith([p], { discardPile: [oldPower] })}
        viewerIndex={0} perkId="bin" onSubmit={onSubmit} onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Boost')).toBeInTheDocument(); // POWER — matches d1
    expect(screen.queryByText('Metal Chain')).not.toBeInTheDocument(); // EVIDENCE — no match in the discard

    fireEvent.click(screen.getByText('Boost'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('bin', { cardId: 'h1', marketCardId: undefined, targetId: undefined, discardForBonus: false });
  });

  it('Recycling Bin: offers nothing when no hand card has a matching type in the discard', () => {
    const orphan: ActionCard = { id: 'h2', name: 'Metal Chain', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const unrelated: ActionCard = { id: 'd1', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const p = mkPlayer({ id: 'p0', name: 'Ana', hand: [orphan], inventory: [perk('bin', 'Recycling Bin')] });
    render(
      <PerkActionPanel
        state={stateWith([p], { discardPile: [unrelated] })}
        viewerIndex={0} perkId="bin" onSubmit={vi.fn()} onCancel={() => {}}
      />,
    );
    expect(screen.getByText('No card in hand has a matching type in the discard.')).toBeInTheDocument();
    expect(screen.getByText('Use').closest('button')).toBeDisabled();
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

  it('Credit Card: only offers the public Market — a Criminal never sees Black Market cards here', () => {
    const crimRole: RoleIdentity = { id: 'crime-lord', name: 'Crime Lord', team: 'CRIMINAL', powerlevel: 4, abilityName: '', abilityDescription: '' };
    const expandNetwork: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const p = mkPlayer({ id: 'p0', name: 'Ben', team: 'CRIMINAL', role: crimRole, inventory: [perk('cc', 'Credit Card')] });
    render(
      <PerkActionPanel
        state={stateWith([p], { publicMarket: [perk('shop', 'Computer')], blackMarket: [expandNetwork] })}
        viewerIndex={0}
        perkId="cc"
        onSubmit={vi.fn()}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Computer ($2)')).toBeInTheDocument();
    expect(screen.queryByText(/Expand Network/)).not.toBeInTheDocument();
  });

  it('Shady Press: press an opponent by name only — which of their Event cards to force is a separate step (see ShadyPressPanel)', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', team: 'CRIMINAL', inventory: [perk('sp', 'Shady Press')] });
    const opponent = mkPlayer({ id: 'p1', name: 'Ben', team: 'CIVILIAN', hand: [evt] });
    render(<PerkActionPanel state={stateWith([viewer, opponent])} viewerIndex={0} perkId="sp" onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByText('Use').closest('button')).toBeDisabled();
    // This client never inspects Ben's hand to decide what to show — in
    // online play it would be redacted, and checking it here is exactly the
    // bug that used to make Shady Press claim an opponent had no Event cards
    // when they actually did.
    expect(screen.queryByText('Generational Wealth')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('sp', { cardId: undefined, marketCardId: undefined, targetId: 'p1', discardForBonus: false });
  });

  it('Alarm Clock playing Market Exchange opens its own follow-up once the Event card is picked, offering Alarm Clock itself as a giveable perk', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Market Exchange', description: '', type: 'EVENT' };
    const clock = perk('ac', 'Alarm Clock');
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', hand: [evt], inventory: [clock] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    render(<PerkActionPanel state={stateWith([viewer, mate])} viewerIndex={0} perkId="ac" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Market Exchange'));
    expect(screen.getByText('Choose a teammate to exchange a perk with:')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Give a perk'));
    // Alarm Clock itself is offered — not excluded the way Shady Press
    // excludes itself, since it isn't mid-resolution the same way.
    fireEvent.click(screen.getByText('Alarm Clock'));
    fireEvent.click(screen.getByRole('button', { name: /Play Market Exchange/ }));

    expect(onSubmit).toHaveBeenCalledWith('ac', {
      cardId: 'e1', targetId: 'p1',
      eventOptions: { marketCardId: undefined, inventoryCardId: 'ac', takePerk: false, discardMarketIds: [] },
    });
  });

  it('Alarm Clock playing Business Opportunity opens its own follow-up, offering Alarm Clock itself as a sellable item', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Business Opportunity', description: '', type: 'EVENT' };
    const clock = perk('ac', 'Alarm Clock');
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', hand: [evt], inventory: [clock] });
    render(<PerkActionPanel state={stateWith([viewer])} viewerIndex={0} perkId="ac" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Business Opportunity'));
    expect(screen.getByText('Sell a perk or weapon for its cost + $1:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alarm Clock'));
    fireEvent.click(screen.getByRole('button', { name: /Play Business Opportunity/ }));

    expect(onSubmit).toHaveBeenCalledWith('ac', {
      cardId: 'e1', targetId: undefined,
      eventOptions: { marketCardId: undefined, inventoryCardId: 'ac', takePerk: undefined, discardMarketIds: [] },
    });
  });

  it('Alarm Clock playing a non-configurable Event (Lottery) needs no follow-up — the plain Use button submits it directly', () => {
    const onSubmit = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Lottery', description: '', type: 'EVENT' };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', hand: [evt], inventory: [perk('ac', 'Alarm Clock')] });
    render(<PerkActionPanel state={stateWith([viewer])} viewerIndex={0} perkId="ac" onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Lottery'));
    fireEvent.click(screen.getByText('Use'));
    expect(onSubmit).toHaveBeenCalledWith('ac', { cardId: 'e1', marketCardId: undefined, targetId: undefined, discardForBonus: false });
  });
});
