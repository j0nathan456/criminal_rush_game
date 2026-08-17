import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { ExposeEvidencePanel } from './ExposeEvidencePanel';

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
const evidence = (id: string, name: string): ActionCard => ({ id, name, description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<ExposeEvidencePanel />', () => {
  it('submits immediately with no choices when every category has exactly one card', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('sheriff', 'CIVILIAN') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL') });
    const grid = {
      TIME: { cards: [evidence('t1', 'Time card')] },
      MEANS: { cards: [evidence('m1', 'Means card')] },
      LOCATION: { cards: [evidence('l1', 'Location card')] },
      MOTIVE: { cards: [evidence('o1', 'Motive card')] },
    };
    render(
      <ExposeEvidencePanel
        state={stateWith([viewer, target], { evidenceGrid: grid })}
        viewerIndex={0}
        targetId="p1"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Expose Ben').closest('button')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Expose Ben'));
    expect(onSubmit).toHaveBeenCalledWith('p1', {});
  });

  it('requires a choice for every category with more than one card, then submits it', () => {
    const onSubmit = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('sheriff', 'CIVILIAN') });
    const target = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL') });
    const grid = {
      TIME: { cards: [evidence('t1', 'Forensic Files'), evidence('t2', 'Security Footage')] },
      MEANS: { cards: [evidence('m1', 'Means card')] },
      LOCATION: { cards: [evidence('l1', 'Location card')] },
      MOTIVE: { cards: [evidence('o1', 'Motive card')] },
    };
    render(
      <ExposeEvidencePanel
        state={stateWith([viewer, target], { evidenceGrid: grid })}
        viewerIndex={0}
        targetId="p1"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    // Only TIME has a decision to make — MEANS/LOCATION/MOTIVE never show up.
    expect(screen.queryByText('Means card')).not.toBeInTheDocument();
    expect(screen.getByText('Expose Ben').closest('button')).toBeDisabled();

    fireEvent.click(screen.getByText('Security Footage'));
    fireEvent.click(screen.getByText('Expose Ben'));
    expect(onSubmit).toHaveBeenCalledWith('p1', { TIME: 't2' });
  });
});
