import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { TargetPicker } from './TargetPicker';

function role(id: string, team: RoleIdentity['team'], powerlevel = 3): RoleIdentity {
  return { id, name: id, team, powerlevel, abilityName: '', abilityDescription: '' };
}
function mkPlayer(over: Partial<Player> & { id: string; name: string; role: RoleIdentity }): Player {
  return {
    team: over.role.team, hand: [], inventory: [], money: 5, powerLevel: over.role.powerlevel,
    actionsRemaining: 3, hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const wpn = (id: string, name: string, power: number): MarketCard => ({
  id, name, description: '', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power,
});
function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<TargetPicker /> — attack', () => {
  it('lists only legal attack targets and previews both sides’ PL on hover', () => {
    const onSelectTarget = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('w', 'Bat', 2)] });
    const civilian = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN', 2) });
    const injured = mkPlayer({ id: 'p2', name: 'Cy', role: role('attorney', 'CIVILIAN', 3), isInjured: true });
    const s = stateWith([viewer, civilian, injured]);

    render(<TargetPicker state={s} viewerIndex={0} mode="attack" onSelectTarget={onSelectTarget} onCancel={() => {}} />);

    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument(); // already injured — illegal target

    fireEvent.mouseEnter(screen.getByText('Ben'));
    // Ana: 3 (base) + 2 (Bat) + 1 (Hitman's +1 PL per weapon attacking) = 6; Ben: 2 (base) defending.
    expect(screen.getByText(/You:/)).toHaveTextContent('You: 6 PL vs Ben: 2 PL');

    fireEvent.click(screen.getByText('Ben'));
    expect(onSelectTarget).toHaveBeenCalledWith('p1');
  });

  it('shows nothing to pick when no one is a legal target', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('hitman', 'CRIMINAL', 3) });
    const already = mkPlayer({ id: 'p1', name: 'Ben', role: role('mayor', 'CIVILIAN', 2), isInjured: true });
    const s = stateWith([viewer, already]);
    render(<TargetPicker state={s} viewerIndex={0} mode="attack" onSelectTarget={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByText(/No valid target/)).toBeInTheDocument();
  });
});

describe('<TargetPicker /> — expose', () => {
  it('only lists unexposed, uncaptured Criminals', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('sheriff', 'CIVILIAN', 3) });
    const fresh = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL', 3) });
    const already = mkPlayer({ id: 'p2', name: 'Cy', role: role('robber', 'CRIMINAL', 2), isExposed: true });
    const captured = mkPlayer({ id: 'p3', name: 'Deb', role: role('arsonist', 'CRIMINAL', 3), isCaptured: true });
    const s = stateWith([viewer, fresh, already, captured]);

    render(<TargetPicker state={s} viewerIndex={0} mode="expose" onSelectTarget={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument();
    expect(screen.queryByText('Deb')).not.toBeInTheDocument();
  });

  it('never lists a Criminal wearing a Disguise — "cannot be Exposed while held"', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', role: role('sheriff', 'CIVILIAN', 3) });
    const disguised = mkPlayer({
      id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL', 3),
      inventory: [{ id: 'dg', name: 'Disguise', description: '', cost: 1, source: 'BLACK_MARKET', type: 'PERK' }],
    });
    const fresh = mkPlayer({ id: 'p2', name: 'Cy', role: role('robber', 'CRIMINAL', 2) });
    const s = stateWith([viewer, disguised, fresh]);

    render(<TargetPicker state={s} viewerIndex={0} mode="expose" onSelectTarget={vi.fn()} onCancel={() => {}} />);
    expect(screen.queryByText('Ben')).not.toBeInTheDocument();
    expect(screen.getByText('Cy')).toBeInTheDocument();
  });
});
