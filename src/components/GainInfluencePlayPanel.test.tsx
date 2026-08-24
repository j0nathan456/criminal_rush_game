import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { GainInfluencePlayPanel } from './GainInfluencePlayPanel';

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
const evidence = (id: string, cats: ActionCard['evidenceCategories']): ActionCard => ({
  id, name: `Ev-${id}`, description: '', type: 'EVIDENCE', evidenceCategories: cats,
});

describe('<GainInfluencePlayPanel />', () => {
  it("lets a single-category card's holder play it into the grid with one click", () => {
    const onResolve = vi.fn();
    const ev = evidence('ev1', ['MEANS']);
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [ev] });
    const s = stateWith([actor], { pendingEvidencePlay: { playerId: 'p0', cardId: 'ev1' } });

    render(<GainInfluencePlayPanel state={s} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText(/Play into Means/));
    expect(onResolve).toHaveBeenCalledWith('GRID', 'MEANS');
  });

  it('lets the holder cash it in once every Criminal is exposed', () => {
    const onResolve = vi.fn();
    const ev = evidence('ev1', ['MEANS']);
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [ev] });
    const exposedFoe = mkPlayer({ id: 'p1', name: 'Ben', role: role('hitman', 'CRIMINAL'), isExposed: true });
    const s = stateWith([actor, exposedFoe], { pendingEvidencePlay: { playerId: 'p0', cardId: 'ev1' } });

    render(<GainInfluencePlayPanel state={s} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Cash in for $2'));
    expect(onResolve).toHaveBeenCalledWith('CASH');
  });

  it('declining resolves with DECLINE, keeping the card in hand', () => {
    const onResolve = vi.fn();
    const ev = evidence('ev1', ['MEANS']);
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [ev] });
    const s = stateWith([actor], { pendingEvidencePlay: { playerId: 'p0', cardId: 'ev1' } });

    render(<GainInfluencePlayPanel state={s} viewerIndex={0} onResolve={onResolve} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onResolve).toHaveBeenCalledWith('DECLINE');
  });

  it('shows a read-only waiting notice for viewers who are not the actor', () => {
    const ev = evidence('ev1', ['MEANS']);
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN'), hand: [ev] });
    const other = mkPlayer({ id: 'p1', name: 'Ben', role: role('attorney', 'CIVILIAN') });
    const s = stateWith([actor, other], { pendingEvidencePlay: { playerId: 'p0', cardId: 'ev1' } });

    render(<GainInfluencePlayPanel state={s} viewerIndex={1} onResolve={vi.fn()} />);
    expect(screen.getByText(/Waiting for Ana to decide/)).toBeInTheDocument();
    expect(screen.queryByText(/Play into Means/)).not.toBeInTheDocument();
  });

  it('renders nothing when there is no pending offer', () => {
    const actor = mkPlayer({ id: 'p0', name: 'Ana', role: role('mayor', 'CIVILIAN') });
    const s = stateWith([actor], { pendingEvidencePlay: null });

    const { container } = render(<GainInfluencePlayPanel state={s} viewerIndex={0} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
