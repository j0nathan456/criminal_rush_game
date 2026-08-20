import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { BriberyPanel } from './BriberyPanel';

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

describe('<BriberyPanel />', () => {
  it('walks the actor through target then card, dispatching only once at the end', () => {
    const onResolve = vi.fn();
    const evidence: ActionCard = { id: 'e1', name: 'Bloody Glove', description: 'A physical clue.', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL') });
    const civ = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor, civ], {
      pendingBribery: { playerId: 'p0' },
      evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence] } },
    });

    render(<BriberyPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    expect(screen.getByText('💰 Pay $1 to which Civilian?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ben'));
    expect(screen.getByText('💰 Discard which Evidence card?')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(/Bloody Glove/));
    expect(onResolve).toHaveBeenCalledWith('p1', 'MEANS', 'e1');
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('lets the actor back out of the card stage without dispatching', () => {
    const onResolve = vi.fn();
    const evidence: ActionCard = { id: 'e1', name: 'Bloody Glove', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL') });
    const civ = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor, civ], {
      pendingBribery: { playerId: 'p0' },
      evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence] } },
    });

    render(<BriberyPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('💰 Pay $1 to which Civilian?')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('shows a read-only waiting notice for viewers who are not the actor', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL') });
    const viewer = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN') });
    const state = stateWith([actor, viewer], { pendingBribery: { playerId: 'p0' } });

    render(<BriberyPanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana to bribe a Civilian/)).toBeInTheDocument();
    expect(screen.queryByText('💰 Pay $1 to which Civilian?')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no pending Bribery', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('crime-lord', 'CRIMINAL') });
    const state = stateWith([actor], { pendingBribery: null });

    const { container } = render(<BriberyPanel state={state} viewerIndex={0} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
