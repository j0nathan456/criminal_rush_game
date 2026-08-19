import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import { emptyGameState } from '../engine';
import { BodyguardSetupPanel } from './BodyguardSetupPanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'bodyguard', name: 'Bodyguard', team: 'CIVILIAN', powerlevel: 3, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<BodyguardSetupPanel />', () => {
  it("shows a read-only waiting message for viewers who aren't the Bodyguard", () => {
    const bodyguard = mkPlayer({ id: 'p0', name: 'Ana' });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    const state = stateWith([bodyguard, mate], { pendingBodyguardSetup: { bodyguardId: 'p0' } });
    render(<BodyguardSetupPanel state={state} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana/)).toBeInTheDocument();
  });

  it('offers only Civilian teammates, not the Bodyguard themselves or Criminals', () => {
    const bodyguard = mkPlayer({ id: 'p0', name: 'Ana' });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    const enemy = mkPlayer({ id: 'p2', name: 'Cara', team: 'CRIMINAL', role: { ...bodyguard.role, id: 'hitman', team: 'CRIMINAL' } });
    const state = stateWith([bodyguard, mate, enemy], { pendingBodyguardSetup: { bodyguardId: 'p0' } });
    render(<BodyguardSetupPanel state={state} viewerIndex={0} onResolve={vi.fn()} />);
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    expect(screen.queryByText('Cara')).not.toBeInTheDocument();
  });

  it('calls onResolve with the chosen teammate', () => {
    const onResolve = vi.fn();
    const bodyguard = mkPlayer({ id: 'p0', name: 'Ana' });
    const mate1 = mkPlayer({ id: 'p1', name: 'Ben' });
    const mate2 = mkPlayer({ id: 'p2', name: 'Cara' });
    const state = stateWith([bodyguard, mate1, mate2], { pendingBodyguardSetup: { bodyguardId: 'p0' } });
    render(<BodyguardSetupPanel state={state} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Cara'));
    expect(onResolve).toHaveBeenCalledWith('p2');
  });
});
