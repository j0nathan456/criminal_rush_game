import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity } from '../types/game';
import { emptyGameState } from '../engine';
import { ExpressShippingPanel } from './ExpressShippingPanel';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 0, powerLevel: 2, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, ...over };
}

describe('<ExpressShippingPanel />', () => {
  it('renders nothing when there is no pending choice', () => {
    const { container } = render(
      <ExpressShippingPanel state={stateWith([mkPlayer({ id: 'p0', name: 'Ana' })])} viewerIndex={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the owner choose $1 or a draw — never both automatically", () => {
    const onResolve = vi.fn();
    const s = stateWith([mkPlayer({ id: 'p0', name: 'Ana' })], { pendingExpressShipping: { playerId: 'p0' } });
    render(<ExpressShippingPanel state={s} viewerIndex={0} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Draw a card'));
    expect(onResolve).toHaveBeenCalledWith('DRAW');
    onResolve.mockClear();

    fireEvent.click(screen.getByText('Gain $1'));
    expect(onResolve).toHaveBeenCalledWith('MONEY');
  });

  it('shows everyone else a read-only waiting notice', () => {
    const onResolve = vi.fn();
    const s = stateWith(
      [mkPlayer({ id: 'p0', name: 'Ana' }), mkPlayer({ id: 'p1', name: 'Ben' })],
      { pendingExpressShipping: { playerId: 'p0' } },
    );
    render(<ExpressShippingPanel state={s} viewerIndex={1} onResolve={onResolve} />);
    expect(screen.getByText('Waiting for Ana to choose $1 or a card draw.')).toBeInTheDocument();
    expect(screen.queryByText('Gain $1')).not.toBeInTheDocument();
  });
});
