import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { RoleAbilityPanel } from './RoleAbilityPanel';

function role(id: string, name: string, team: RoleIdentity['team']): RoleIdentity {
  return { id, name, team, powerlevel: 3, abilityName: 'Ability', abilityDescription: 'desc' };
}
function mkPlayer(over: Partial<Player> & { id: string; name: string; role: RoleIdentity }): Player {
  return {
    team: over.role.team, hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const evidence = (id: string): ActionCard => ({ id, name: `Ev-${id}`, description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] });
const expand = (id: string, cost: number): MarketCard => ({ id, name: 'Expand Network', description: '', cost, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 });
const weapon = (id: string, name: string, cost: number): MarketCard => ({
  id, name, description: '', cost, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 2,
});

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<RoleAbilityPanel />', () => {
  it('Bodyguard: pick a teammate and submit a targetId', () => {
    const onSubmit = vi.fn();
    const s = stateWith([
      mkPlayer({ id: 'p0', name: 'Guard', role: role('bodyguard', 'Bodyguard', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', name: 'Ally', role: role('mayor', 'Mayor', 'CIVILIAN') }),
    ]);
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    expect(screen.getByText('Use ability').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Ally'));
    fireEvent.click(screen.getByText('Use ability'));
    expect(onSubmit).toHaveBeenCalledWith({ targetId: 'p1', cardId: undefined, category: undefined, mode: undefined });
  });

  it('Forger: needs an Evidence card and a filled category', () => {
    const onSubmit = vi.fn();
    const gridCard: ActionCard = { id: 'x', name: 'x', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const s = stateWith(
      [mkPlayer({ id: 'p0', name: 'Faker', role: role('forger', 'Forger', 'CRIMINAL'), hand: [evidence('e1')] })],
      { evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [gridCard] } } },
    );
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Ev-e1'));
    fireEvent.click(screen.getByText('Means'));
    fireEvent.click(screen.getByText('Use ability'));
    expect(onSubmit).toHaveBeenCalledWith({
      targetId: undefined, cardId: 'e1', category: 'MEANS', gridCardId: undefined, mode: undefined,
    });
  });

  it('Forger: with more than one card piled up, picks which specific one to clear', () => {
    const onSubmit = vi.fn();
    const first: ActionCard = { id: 'g1', name: 'Metal Chain', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const second: ActionCard = { id: 'g2', name: 'Bloody Glove', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const s = stateWith(
      [mkPlayer({ id: 'p0', name: 'Faker', role: role('forger', 'Forger', 'CRIMINAL'), hand: [evidence('e1')] })],
      { evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [first, second] } } },
    );
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Ev-e1'));
    fireEvent.click(screen.getByText('Means'));
    expect(screen.getByText('Use ability').closest('button')).toBeDisabled(); // must pick which grid card

    fireEvent.click(screen.getByText('Bloody Glove'));
    fireEvent.click(screen.getByText('Use ability'));
    expect(onSubmit).toHaveBeenCalledWith({
      targetId: undefined, cardId: 'e1', category: 'MEANS', gridCardId: 'g2', mode: undefined,
    });
  });

  it('Robber: only the steal option the target actually qualifies for shows up', () => {
    const onSubmit = vi.fn();
    const money2 = (id: string): ActionCard => ({ id, name: `M-${id}`, description: '', type: 'MONEY', value: 1 });
    const s = stateWith([
      mkPlayer({ id: 'p0', name: 'Rob', role: role('robber', 'Robber', 'CRIMINAL') }),
      // Civilian 1: $5 and 2 cards — qualifies for steal-$1 (needs $3+) but not steal-a-card (needs 3+).
      mkPlayer({ id: 'p1', name: 'Civ1', role: role('mayor', 'Mayor', 'CIVILIAN'), money: 5, hand: [money2('a'), money2('b')] }),
    ]);
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={onSubmit} onCancel={() => {}} />);

    fireEvent.click(screen.getByText('Civ1'));
    expect(screen.getByText('Steal $1')).toBeInTheDocument();
    expect(screen.queryByText('Steal a card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Steal $1'));
    fireEvent.click(screen.getByText('Use ability'));
    expect(onSubmit).toHaveBeenCalledWith({ targetId: 'p1', cardId: undefined, category: undefined, gridCardId: undefined, mode: 'MONEY' });
  });

  it('Robber: excludes a Civilian who qualifies for neither option', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', name: 'Rob', role: role('robber', 'Robber', 'CRIMINAL') }),
      mkPlayer({ id: 'p1', name: 'Broke', role: role('mayor', 'Mayor', 'CIVILIAN'), money: 1, hand: [] }),
    ]);
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText('Broke')).not.toBeInTheDocument();
    expect(screen.getByText('No eligible players.')).toBeInTheDocument();
  });

  it('Crime Lord: the Expand Network button shows the $1-off price, not the base cost', () => {
    const s = stateWith([mkPlayer({ id: 'p0', name: 'Ben', role: role('crime-lord', 'Crime Lord', 'CRIMINAL') })], {
      blackMarket: [expand('en', 5)],
    });
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText('Expand Network ($5)')).not.toBeInTheDocument();
    expect(screen.getByText('Expand Network ($4)')).toBeInTheDocument();
  });

  it('Evil Scientist: the Tech/Chemical weapon buttons show the $1-off price, not the base cost', () => {
    const s = stateWith([mkPlayer({ id: 'p0', name: 'Eve', role: role('evil-scientist', 'Evil Scientist', 'CRIMINAL') })], {
      publicMarket: [weapon('w1', 'Robot Soldier', 4)],
    });
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText('Robot Soldier ($4)')).not.toBeInTheDocument();
    expect(screen.getByText('Robot Soldier ($3)')).toBeInTheDocument();
  });

  it("Collector: buys at full price — no discount applies to what's shown here", () => {
    const s = stateWith([mkPlayer({ id: 'p0', name: 'Cole', role: role('collector', 'Collector', 'CIVILIAN') })], {
      publicMarket: [weapon('w1', 'Bat', 3)],
    });
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Bat ($3)')).toBeInTheDocument();
  });

  it('shows a passive message and no Use button for passive roles', () => {
    const s = stateWith([mkPlayer({ id: 'p0', name: 'Mona', role: role('spy', 'Spy', 'CRIMINAL') })]);
    render(<RoleAbilityPanel state={s} viewerIndex={0} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/passive/i)).toBeInTheDocument();
    expect(screen.queryByText('Use ability')).not.toBeInTheDocument();
  });
});
