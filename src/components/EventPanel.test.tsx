import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
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
