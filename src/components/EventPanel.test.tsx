import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { EventPanel } from './EventPanel';

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
const taxCard: ActionCard = { id: 'e1', name: 'Tax Collection', description: '', type: 'EVENT' };
const gainInfluenceCard: ActionCard = { id: 'e2', name: 'Gain Influence', description: '', type: 'EVENT' };
const businessCard: ActionCard = { id: 'e3', name: 'Business Opportunity', description: '', type: 'EVENT' };
const marketAccessCard: ActionCard = { id: 'e4', name: 'Market Access', description: '', type: 'EVENT' };
const marketExchangeCard: ActionCard = { id: 'e5', name: 'Market Exchange', description: '', type: 'EVENT' };
const springCleaningCard: ActionCard = { id: 'e6', name: 'Spring Cleaning', description: '', type: 'EVENT' };
const trafficJamCard: ActionCard = { id: 'e7', name: 'Traffic Jam', description: '', type: 'EVENT' };
const perkCard = (id: string, name: string, cost: number): MarketCard => ({ id, name, description: '', cost, source: 'PUBLIC', type: 'PERK' });
const moneyCard: ActionCard = { id: 'm1', name: 'Profit', description: '', type: 'MONEY', value: 1 };

describe('<EventPanel /> — Tax Collection', () => {
  it('only lists opponents with $1 or more, not the broke one or a teammate', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const richFoe = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL'), money: 3 });
    const brokeFoe = mkPlayer({ id: 'p2', name: 'Cy', role: role('robber', 'CRIMINAL'), money: 0 });
    const teammate = mkPlayer({ id: 'p3', name: 'Dee', role: role('attorney', 'CIVILIAN'), money: 5 });
    const s = stateWith([viewer, richFoe, brokeFoe, teammate]);

    render(<EventPanel state={s} viewerIndex={0} card={taxCard} onSubmit={vi.fn()} onCancel={() => {}} />);

    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument(); // opponent, but $0
    expect(screen.queryByText('Dee')).not.toBeInTheDocument(); // has money, but a teammate
  });

  it('submits the chosen opponent as the target', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const foe = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL'), money: 3 });
    const s = stateWith([viewer, foe]);

    render(<EventPanel state={s} viewerIndex={0} card={taxCard} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByRole('button', { name: /Play Tax Collection/ }));

    expect(onSubmit).toHaveBeenCalledWith('p1', { marketCardId: undefined, inventoryCardId: undefined, takePerk: undefined, discardMarketIds: [] });
  });

  it('shows nothing to pick when no opponent has any money', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const brokeFoe = mkPlayer({ id: 'p1', name: 'Cy', role: role('robber', 'CRIMINAL'), money: 0 });
    const s = stateWith([viewer, brokeFoe]);

    render(<EventPanel state={s} viewerIndex={0} card={taxCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.queryByText('Cy')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play Tax Collection/ })).toBeDisabled();
  });
});

describe('<EventPanel /> — Market Access', () => {
  it('shows the $1-off price on the button, not the base cost', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([viewer], { publicMarket: [perkCard('m1', 'Computer', 2)] });

    render(<EventPanel state={s} viewerIndex={0} card={marketAccessCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.queryByText('Computer ($2)')).not.toBeInTheDocument();
    expect(screen.getByText('Computer ($1)')).toBeInTheDocument();
  });

  it('clamps at $0 rather than going negative', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([viewer], { publicMarket: [perkCard('m1', 'Free Sample', 0)] });

    render(<EventPanel state={s} viewerIndex={0} card={marketAccessCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByText('Free Sample ($0)')).toBeInTheDocument();
  });

  it('hides a card the viewer still cannot afford even after the $1 discount', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 1 });
    const s = stateWith([viewer], { publicMarket: [perkCard('m1', 'Computer', 3)] }); // $2 after discount — still too much

    render(<EventPanel state={s} viewerIndex={0} card={marketAccessCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.queryByText('Computer ($2)')).not.toBeInTheDocument();
    expect(screen.getByText("You can't afford anything here.")).toBeInTheDocument();
  });

  it('shows only what the viewer can afford when the Market has a mix', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 1 });
    const s = stateWith([viewer], { publicMarket: [perkCard('m1', 'Computer', 3), perkCard('m2', 'Cheap', 1)] });

    render(<EventPanel state={s} viewerIndex={0} card={marketAccessCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByText('Cheap ($0)')).toBeInTheDocument();
    expect(screen.queryByText('Computer ($2)')).not.toBeInTheDocument();
  });

  it("treats being unaffordable as impossible for Shady Press's forced-discard offer", () => {
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), money: 0 });
    const s = stateWith([presser], { publicMarket: [perkCard('m1', 'Computer', 3)] });

    render(
      <EventPanel
        state={s}
        viewerIndex={0}
        card={marketAccessCard}
        onSubmit={vi.fn()}
        onCancel={() => {}}
        forceDiscardIfImpossible
      />,
    );
    expect(screen.getByRole('button', { name: /Discard/ })).toBeInTheDocument();
  });
});

describe('<EventPanel /> — Gain Influence', () => {
  it('only lists opponents with a card in hand, not an empty-handed one or a teammate', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const stockedFoe = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL'), hand: [moneyCard] });
    const emptyFoe = mkPlayer({ id: 'p2', name: 'Cy', role: role('robber', 'CRIMINAL'), hand: [] });
    const teammate = mkPlayer({ id: 'p3', name: 'Dee', role: role('attorney', 'CIVILIAN'), hand: [moneyCard] });
    const s = stateWith([viewer, stockedFoe, emptyFoe, teammate]);

    render(<EventPanel state={s} viewerIndex={0} card={gainInfluenceCard} onSubmit={vi.fn()} onCancel={() => {}} />);

    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument(); // opponent, but no cards to take
    expect(screen.queryByText('Dee')).not.toBeInTheDocument(); // has cards, but a teammate
  });
});

describe('<EventPanel /> — Business Opportunity with nothing sellable', () => {
  it('without forceDiscardIfImpossible, just leaves Play disabled (normal self-play — Cancel keeps the card)', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL'), inventory: [] });
    const s = stateWith([viewer]);

    render(<EventPanel state={s} viewerIndex={0} card={businessCard} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /Play Business Opportunity/ })).toBeDisabled();
    expect(screen.queryByText(/Discard Business Opportunity/)).not.toBeInTheDocument();
  });

  it('with forceDiscardIfImpossible (Shady Press), offers to discard it instead of leaving the player stuck', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL'), inventory: [] });
    const s = stateWith([viewer]);

    render(
      <EventPanel state={s} viewerIndex={0} card={businessCard} onSubmit={onSubmit} onCancel={() => {}} forceDiscardIfImpossible />,
    );
    expect(screen.queryByRole('button', { name: /Play Business Opportunity/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Discard Business Opportunity/));
    expect(onSubmit).toHaveBeenCalledWith(undefined, {});
  });

  it('with forceDiscardIfImpossible but something sellable, behaves normally (no discard shortcut)', () => {
    const onSubmit = vi.fn();
    const perk = { id: 'pk', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const };
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL'), inventory: [perk] });
    const s = stateWith([viewer]);

    render(
      <EventPanel state={s} viewerIndex={0} card={businessCard} onSubmit={onSubmit} onCancel={() => {}} forceDiscardIfImpossible />,
    );
    expect(screen.queryByText(/Discard Business Opportunity — nothing to do/)).not.toBeInTheDocument();
    const playButton = screen.getByRole('button', { name: /Play Business Opportunity/ });
    expect(playButton).toBeDisabled();

    fireEvent.click(screen.getByText('Radio'));
    expect(playButton).toBeEnabled();
    fireEvent.click(playButton);
    expect(onSubmit).toHaveBeenCalledWith(undefined, { marketCardId: undefined, inventoryCardId: 'pk', takePerk: undefined, discardMarketIds: [] });
  });
});

describe('<EventPanel /> — Market Exchange', () => {
  it('only lists teammates (not opponents or the viewer), then gathers give/take direction and which perk', () => {
    const onSubmit = vi.fn();
    const perk1 = perkCard('pk1', 'Radio', 2);
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), inventory: [perk1] });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('attorney', 'CIVILIAN') });
    const opp = mkPlayer({ id: 'p2', name: 'Cy', role: role('hitman', 'CRIMINAL') });
    const s = stateWith([viewer, mate, opp]);

    render(<EventPanel state={s} viewerIndex={0} card={marketExchangeCard} onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument(); // opponent, not a teammate
    expect(screen.queryByText('Ana')).not.toBeInTheDocument(); // the viewer themself

    fireEvent.click(screen.getByText('Bo'));
    fireEvent.click(screen.getByText('Give a perk'));
    fireEvent.click(screen.getByText('Radio')); // from the viewer's own inventory, since giving
    fireEvent.click(screen.getByRole('button', { name: /Play Market Exchange/ }));

    expect(onSubmit).toHaveBeenCalledWith('p1', { marketCardId: undefined, inventoryCardId: 'pk1', takePerk: false, discardMarketIds: [] });
  });

  it('offers the teammate\'s perks instead when taking rather than giving', () => {
    const onSubmit = vi.fn();
    const theirs = perkCard('pk2', 'Bank', 3);
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('attorney', 'CIVILIAN'), inventory: [theirs] });
    const s = stateWith([viewer, mate]);

    render(<EventPanel state={s} viewerIndex={0} card={marketExchangeCard} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Bo'));
    fireEvent.click(screen.getByText('Take a perk'));
    fireEvent.click(screen.getByText('Bank')); // from Bo's inventory, since taking
    fireEvent.click(screen.getByRole('button', { name: /Play Market Exchange/ }));

    expect(onSubmit).toHaveBeenCalledWith('p1', { marketCardId: undefined, inventoryCardId: 'pk2', takePerk: true, discardMarketIds: [] });
  });

  it("treats having no teammate at all as impossible for Shady Press's forced-discard offer", () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([viewer]);

    render(
      <EventPanel state={s} viewerIndex={0} card={marketExchangeCard} onSubmit={onSubmit} onCancel={() => {}} forceDiscardIfImpossible />,
    );
    fireEvent.click(screen.getByText(/Discard Market Exchange — nothing to do/));
    expect(onSubmit).toHaveBeenCalledWith(undefined, {});
  });

  it("also treats a teammate existing but nothing movable in either direction as impossible — not just 'no teammate' (found live: a presser with only the resolving Shady Press perk and an empty-inventory teammate got stuck with Play disabled and no discard offer)", () => {
    const onSubmit = vi.fn();
    // The viewer's only perk is the Shady Press card itself, excluded since
    // it's still resolving — so there is nothing to give. The teammate has
    // no perks either — so there is nothing to take. A teammate exists, but
    // the exchange has no legal completion either way.
    const shadyPress = perkCard('sp', 'Shady Press', 2);
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL'), inventory: [shadyPress] });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('smuggler', 'CRIMINAL') });
    const s = stateWith([viewer, mate]);

    render(
      <EventPanel
        state={s} viewerIndex={0} card={marketExchangeCard} onSubmit={onSubmit} onCancel={() => {}}
        forceDiscardIfImpossible excludeInventoryCardId="sp"
      />,
    );
    fireEvent.click(screen.getByText('Bo'));
    expect(screen.queryByRole('button', { name: /Play Market Exchange/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Discard Market Exchange — nothing to do/));
    expect(onSubmit).toHaveBeenCalledWith(undefined, {});
  });

  it('is not impossible when only ONE direction has a perk — e.g. the viewer can still give even though the teammate has nothing to give back', () => {
    const onSubmit = vi.fn();
    const own = perkCard('pk1', 'Radio', 2);
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL'), inventory: [own] });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('smuggler', 'CRIMINAL') }); // nothing of their own
    const s = stateWith([viewer, mate]);

    render(
      <EventPanel state={s} viewerIndex={0} card={marketExchangeCard} onSubmit={onSubmit} onCancel={() => {}} forceDiscardIfImpossible />,
    );
    fireEvent.click(screen.getByText('Bo'));
    expect(screen.queryByText(/Discard Market Exchange — nothing to do/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Give a perk'));
    fireEvent.click(screen.getByText('Radio'));
    fireEvent.click(screen.getByRole('button', { name: /Play Market Exchange/ }));
    expect(onSubmit).toHaveBeenCalledWith('p1', { marketCardId: undefined, inventoryCardId: 'pk1', takePerk: false, discardMarketIds: [] });
  });
});

describe('<EventPanel /> — Spring Cleaning', () => {
  it('requires exactly 3 chosen Market cards, capping further picks at 3', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const market = ['m1', 'm2', 'm3', 'm4'].map((id) => perkCard(id, id, 2));
    const s = stateWith([viewer], { publicMarket: market });

    render(<EventPanel state={s} viewerIndex={0} card={springCleaningCard} onSubmit={onSubmit} onCancel={() => {}} />);

    const playButton = screen.getByRole('button', { name: /Play Spring Cleaning/ });
    fireEvent.click(screen.getByText('m1 ($2)'));
    fireEvent.click(screen.getByText('m2 ($2)'));
    expect(playButton).toBeDisabled(); // only 2/3 chosen

    fireEvent.click(screen.getByText('m3 ($2)'));
    fireEvent.click(screen.getByText('m4 ($2)')); // 4th pick is a no-op, capped at 3
    expect(playButton).toBeEnabled();
    fireEvent.click(playButton);

    expect(onSubmit).toHaveBeenCalledWith(undefined, {
      marketCardId: undefined, inventoryCardId: undefined, takePerk: undefined, discardMarketIds: ['m1', 'm2', 'm3'],
    });
  });

  it("treats a too-small Market as impossible for Shady Press's forced-discard offer", () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([viewer], { publicMarket: [perkCard('m1', 'Radio', 2)] }); // only 1, need 3

    render(
      <EventPanel state={s} viewerIndex={0} card={springCleaningCard} onSubmit={onSubmit} onCancel={() => {}} forceDiscardIfImpossible />,
    );
    fireEvent.click(screen.getByText(/Discard Spring Cleaning — nothing to do/));
    expect(onSubmit).toHaveBeenCalledWith(undefined, {});
  });
});

describe('<EventPanel /> — Traffic Jam', () => {
  it('only lists opponents, not teammates or the viewer', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p1', name: 'Bo', role: role('attorney', 'CIVILIAN') });
    const opp = mkPlayer({ id: 'p2', name: 'Cy', role: role('hitman', 'CRIMINAL') });
    const s = stateWith([viewer, mate, opp]);

    render(<EventPanel state={s} viewerIndex={0} card={trafficJamCard} onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.queryByText('Bo')).not.toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Cy'));
    fireEvent.click(screen.getByRole('button', { name: /Play Traffic Jam/ }));

    expect(onSubmit).toHaveBeenCalledWith('p2', { marketCardId: undefined, inventoryCardId: undefined, takePerk: undefined, discardMarketIds: [] });
  });
});
