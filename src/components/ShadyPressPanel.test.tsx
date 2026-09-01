import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { ShadyPressPanel } from './ShadyPressPanel';

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
/** A stand-in for an online-redacted hand: every real card replaced. */
const hidden = (n: number): ActionCard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `hidden-${i}`, name: 'Hidden', description: '', type: 'MONEY' as const }));

describe('<ShadyPressPanel />', () => {
  it('shows a read-only waiting notice to everyone but the presser', () => {
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={1} />); // viewing as the target, not the presser
    expect(screen.getByText('Waiting for Ana to play a card from Ben\'s Events.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it("reads the revealed cards from pendingShadyPress, never the target's (possibly redacted) hand", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    // The target's own hand is redacted (as it would be for every online
    // viewer but themselves) — if the panel read from here instead of the
    // pending reveal, it would wrongly conclude there's nothing to play.
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN'), hand: hidden(2) });
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    expect(screen.getByText(/Events, revealed/)).toBeInTheDocument();
    expect(screen.getByText('Generational Wealth')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Generational Wealth'));
    fireEvent.click(screen.getByText('Play card'));
    expect(onResolve).toHaveBeenCalledWith('e1');
  });

  it("a configurable Event opens its own follow-up, gathered from the presser — not the target who merely supplied the card", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Tax Collection', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const taxable = mkPlayer({ id: 'p2', name: 'Cara', role: role('sheriff', 'CIVILIAN'), money: 3 });
    const s = stateWith([presser, target, taxable], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Tax Collection'));
    // Tax Collection's own follow-up appears, asking Ana (the presser) to
    // choose who it taxes — not Ben, who merely supplied the card.
    expect(screen.getByText('Play Tax Collection').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Cara'));
    fireEvent.click(screen.getByText('Play Tax Collection'));
    expect(onResolve).toHaveBeenCalledWith('e1', 'p2', expect.objectContaining({}));
  });

  it('routes a forced Market Access through its own follow-up (buy at $1 off, from the presser\'s money)', () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Market Access', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL'), money: 1 });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
      publicMarket: [{ id: 'm1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' }],
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Market Access'));
    fireEvent.click(screen.getByText('Radio ($1)')); // $2 base, $1 off
    fireEvent.click(screen.getByText('Play Market Access'));
    expect(onResolve).toHaveBeenCalledWith('e1', undefined, expect.objectContaining({ marketCardId: 'm1' }));
  });

  it("routes a forced Gain Influence through its own follow-up (steals for the presser, from an opponent of the presser's team)", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Gain Influence', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const victim = mkPlayer({ id: 'p2', name: 'Cara', role: role('sheriff', 'CIVILIAN'), hand: [{ id: 'c9', name: 'Profit', description: '', type: 'MONEY' as const }] });
    const s = stateWith([presser, target, victim], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Gain Influence'));
    fireEvent.click(screen.getByText('Cara'));
    fireEvent.click(screen.getByText('Play Gain Influence'));
    expect(onResolve).toHaveBeenCalledWith('e1', 'p2', expect.objectContaining({}));
  });

  it("routes a forced Market Exchange through its own follow-up, scoped to the presser's own team and inventory", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Market Exchange', description: '', type: 'EVENT' };
    const own = { id: 'pk1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL'), inventory: [own] });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p2', name: 'Cara', role: role('smuggler', 'CRIMINAL') });
    const s = stateWith([presser, target, mate], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Market Exchange'));
    fireEvent.click(screen.getByText('Cara')); // presser's Criminal teammate, not Ben
    fireEvent.click(screen.getByText('Give a perk'));
    fireEvent.click(screen.getByText('Radio')); // from the presser's own inventory
    fireEvent.click(screen.getByText('Play Market Exchange'));
    expect(onResolve).toHaveBeenCalledWith('e1', 'p2', expect.objectContaining({ inventoryCardId: 'pk1', takePerk: false }));
  });

  it('routes a forced Spring Cleaning through its own follow-up (discard 3 Market cards)', () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Spring Cleaning', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const market = ['m1', 'm2', 'm3', 'm4'].map((id) => ({ id, name: id, description: '', cost: 2, source: 'PUBLIC' as const, type: 'PERK' as const }));
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
      publicMarket: market,
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Spring Cleaning'));
    fireEvent.click(screen.getByText('m1 ($2)'));
    fireEvent.click(screen.getByText('m2 ($2)'));
    fireEvent.click(screen.getByText('m3 ($2)'));
    fireEvent.click(screen.getByText('Play Spring Cleaning'));
    expect(onResolve).toHaveBeenCalledWith('e1', undefined, expect.objectContaining({ discardMarketIds: ['m1', 'm2', 'm3'] }));
  });

  it("routes a forced Traffic Jam through its own follow-up (snarls an opponent of the presser's team)", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Traffic Jam', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Traffic Jam'));
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Play Traffic Jam'));
    expect(onResolve).toHaveBeenCalledWith('e1', 'p1', expect.objectContaining({}));
  });

  it("a forced Ally Support opens its own dedicated flow instead of discarding with no effect", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Ally Support', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    // The presser's own teammate, whose role Action gets copied — mirrors the
    // reported bug (a Criminal forces a Civilian's Ally Support to copy their
    // own teammate's Action).
    const mate = mkPlayer({ id: 'p2', name: 'Cara', role: role('collector', 'CRIMINAL') });
    const s = stateWith([presser, target, mate], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
      publicMarket: [{ id: 'm1', name: 'Computer', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' }],
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Ally Support'));
    // Not the generic "Play card" button — AllySupportPanel's own teammate/
    // Action picker, scoped to the presser's team (not the target's).
    expect(screen.queryByText('Play card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Cara'));
    fireEvent.click(screen.getByText(/\(role\)/));
    fireEvent.click(screen.getByText('Computer ($2)'));
    fireEvent.click(screen.getByText('Copy this Action'));

    expect(onResolve).toHaveBeenCalledWith('e1', 'p2', {
      allyPayload: { targetId: undefined, cardId: 'm1', category: undefined, mode: undefined },
    });
  });

  it("offers to discard a forced Business Opportunity instead of getting stuck when the presser has nothing to sell", () => {
    const onResolve = vi.fn();
    const evt: ActionCard = { id: 'e1', name: 'Business Opportunity', description: '', type: 'EVENT' };
    const presser = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL') }); // nothing sellable
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([presser, target], {
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [evt] },
    });
    render(<ShadyPressPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Business Opportunity'));
    expect(screen.queryByRole('button', { name: /Play Business Opportunity/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Discard Business Opportunity/));
    expect(onResolve).toHaveBeenCalledWith('e1', undefined, {});
  });

  it('renders nothing when there is no Shady Press pending', () => {
    const { container } = render(<ShadyPressPanel state={emptyGameState()} viewerIndex={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
