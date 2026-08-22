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
