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
