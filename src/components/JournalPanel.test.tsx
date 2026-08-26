import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { JournalPanel } from './JournalPanel';

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

const noInputCard: ActionCard = { id: 'e1', name: 'Generational Wealth', description: '', type: 'EVENT' };
const configurableCard: ActionCard = { id: 'e2', name: 'Gain Influence', description: '', type: 'EVENT' };

describe('<JournalPanel />', () => {
  it("shows a read-only waiting message for viewers who aren't the one who played the Event", () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const viewer = mkPlayer({ id: 'p1', name: 'Ben', role: role('sheriff', 'CIVILIAN') });
    const state = stateWith([actor, viewer], { pendingJournal: { playerId: 'p0', card: noInputCard } });
    render(<JournalPanel state={state} viewerIndex={1} onUse={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana/)).toBeInTheDocument();
  });

  it('calls onDecline when Decline is clicked', () => {
    const onDecline = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], { pendingJournal: { playerId: 'p0', card: noInputCard } });
    render(<JournalPanel state={state} viewerIndex={0} onUse={vi.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByText('Decline'));
    expect(onDecline).toHaveBeenCalled();
  });

  it('a no-input Event calls onUse immediately, with no extra gathering step', () => {
    const onUse = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor], { pendingJournal: { playerId: 'p0', card: noInputCard } });
    render(<JournalPanel state={state} viewerIndex={0} onUse={onUse} onDecline={vi.fn()} />);
    fireEvent.click(screen.getByText('Use Journal'));
    expect(onUse).toHaveBeenCalledWith(undefined, {});
  });

  it('a configurable Event opens a fresh target picker instead of calling onUse right away', () => {
    const onUse = vi.fn();
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const foe = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL'), hand: [noInputCard] });
    const state = stateWith([actor, foe], { pendingJournal: { playerId: 'p0', card: configurableCard } });
    render(<JournalPanel state={state} viewerIndex={0} onUse={onUse} onDecline={vi.fn()} />);

    fireEvent.click(screen.getByText('Use Journal'));
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByText('Ben')).toBeInTheDocument(); // EventPanel's opponent picker

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Repeat Gain Influence'));
    expect(onUse).toHaveBeenCalledWith('p1', { marketCardId: undefined, inventoryCardId: undefined, takePerk: undefined, discardMarketIds: [] });
  });

  it('Ally Support opens the AllySupportPanel picker, letting the repeat copy a different teammate', () => {
    const onUse = vi.fn();
    const allySupportCard: ActionCard = { id: 'e3', name: 'Ally Support', description: '', type: 'EVENT' };
    const coffee = { id: 'cm1', name: 'Coffee Machine', description: '', cost: 3, source: 'PUBLIC' as const, type: 'PERK' as const };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', role: role('sheriff', 'CIVILIAN'), inventory: [coffee] });
    const state = stateWith([actor, mate], { pendingJournal: { playerId: 'p0', card: allySupportCard } });
    render(<JournalPanel state={state} viewerIndex={0} onUse={onUse} onDecline={vi.fn()} />);

    fireEvent.click(screen.getByText('Use Journal'));
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByText('Whose Action?')).toBeInTheDocument(); // AllySupportPanel, not EventPanel

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Coffee Machine'));
    fireEvent.click(screen.getByText('Copy Coffee Machine'));
    expect(onUse).toHaveBeenCalledWith('p1', {
      allyPerkId: 'cm1',
      allyPayload: { cardId: undefined, marketCardId: undefined, targetId: undefined, discardForBonus: false },
    });
  });
});
