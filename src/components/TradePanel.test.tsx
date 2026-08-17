import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { TradePanel } from './TradePanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 0, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}
const money = (id: string): ActionCard => ({ id, name: `Profit-${id}`, description: '', type: 'MONEY', value: 2 });
const weapon = (id: string, name: string): MarketCard => ({ id, name, description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 });

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<TradePanel /> — initiating', () => {
  it('only offers gift options the initiator actually has', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', money: 0, hand: [], inventory: [] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    render(<TradePanel state={stateWith([viewer, mate])} viewerIndex={0} />);

    fireEvent.click(screen.getByText('Ben'));
    expect(screen.getByText('Ana has nothing to trade.')).toBeInTheDocument();
    expect(screen.queryByText('Trade a weapon')).not.toBeInTheDocument();
    expect(screen.queryByText('Trade $1')).not.toBeInTheDocument();
    expect(screen.queryByText('Trade a card')).not.toBeInTheDocument();
  });

  it('hides the weapon option once the teammate already has 2 weapons', () => {
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', inventory: [weapon('w1', 'Axe')] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben', inventory: [weapon('w2', 'Bat'), weapon('w3', 'Pistol')] });
    render(<TradePanel state={stateWith([viewer, mate])} viewerIndex={0} />);

    fireEvent.click(screen.getByText('Ben'));
    expect(screen.queryByText('Trade a weapon')).not.toBeInTheDocument();
  });

  it('gives $1 immediately — no sub-selection needed', () => {
    const onInitiate = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', money: 2 });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    render(<TradePanel state={stateWith([viewer, mate])} viewerIndex={0} onInitiate={onInitiate} />);

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Trade $1'));
    fireEvent.click(screen.getByText('Confirm trade'));
    expect(onInitiate).toHaveBeenCalledWith('p1', { kind: 'MONEY' });
  });

  it('trading a card requires picking which one', () => {
    const onInitiate = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', hand: [money('c1'), money('c2')] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    render(<TradePanel state={stateWith([viewer, mate])} viewerIndex={0} onInitiate={onInitiate} />);

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Trade a card'));
    expect(screen.getByText('Confirm trade').closest('button')).toBeDisabled();

    fireEvent.click(screen.getByText('Profit-c2'));
    fireEvent.click(screen.getByText('Confirm trade'));
    expect(onInitiate).toHaveBeenCalledWith('p1', { kind: 'CARD', cardId: 'c2' });
  });

  it('trading a weapon requires picking which one', () => {
    const onInitiate = vi.fn();
    const viewer = mkPlayer({ id: 'p0', name: 'Ana', inventory: [weapon('w1', 'Axe'), weapon('w2', 'Bat')] });
    const mate = mkPlayer({ id: 'p1', name: 'Ben' });
    render(<TradePanel state={stateWith([viewer, mate])} viewerIndex={0} onInitiate={onInitiate} />);

    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(screen.getByText('Trade a weapon'));
    fireEvent.click(screen.getByText('Bat'));
    fireEvent.click(screen.getByText('Confirm trade'));
    expect(onInitiate).toHaveBeenCalledWith('p1', { kind: 'WEAPON', cardId: 'w2' });
  });
});

describe('<TradePanel /> — the pending return', () => {
  it('shows the recipient a picker constrained to their own resources', () => {
    const onResolveReturn = vi.fn();
    const initiator = mkPlayer({ id: 'p0', name: 'Ana' });
    const recipient = mkPlayer({ id: 'p1', name: 'Ben', hand: [money('c1')] });
    const s = stateWith([initiator, recipient], { pendingTrade: { initiatorId: 'p0', recipientId: 'p1' } });

    render(<TradePanel state={s} viewerIndex={1} onResolveReturn={onResolveReturn} />);
    expect(screen.getByText(/give something back/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Trade a card'));
    fireEvent.click(screen.getByText('Profit-c1'));
    fireEvent.click(screen.getByText('Confirm trade'));
    expect(onResolveReturn).toHaveBeenCalledWith({ kind: 'CARD', cardId: 'c1' });
  });

  it('lets the recipient confirm they have nothing to give back', () => {
    const onResolveReturn = vi.fn();
    const initiator = mkPlayer({ id: 'p0', name: 'Ana' });
    const recipient = mkPlayer({ id: 'p1', name: 'Ben', money: 0, hand: [], inventory: [] });
    const s = stateWith([initiator, recipient], { pendingTrade: { initiatorId: 'p0', recipientId: 'p1' } });

    render(<TradePanel state={s} viewerIndex={1} onResolveReturn={onResolveReturn} />);
    fireEvent.click(screen.getByText('Confirm — nothing to give back'));
    expect(onResolveReturn).toHaveBeenCalledWith(null);
  });

  it('shows everyone else a read-only waiting notice, with no picker', () => {
    const initiator = mkPlayer({ id: 'p0', name: 'Ana' });
    const recipient = mkPlayer({ id: 'p1', name: 'Ben', hand: [money('c1')] });
    const bystander = mkPlayer({ id: 'p2', name: 'Cara' });
    const s = stateWith([initiator, recipient, bystander], { pendingTrade: { initiatorId: 'p0', recipientId: 'p1' } });

    render(<TradePanel state={s} viewerIndex={0} />); // the initiator, not the recipient
    expect(screen.getByText('Waiting for Ben to trade something back to Ana.')).toBeInTheDocument();
    expect(screen.queryByText('Trade a card')).not.toBeInTheDocument();
  });
});
