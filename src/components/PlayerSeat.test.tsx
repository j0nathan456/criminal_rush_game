import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import { PlayerSeat } from './PlayerSeat';

function mkPlayer(over: Partial<Player> & { id: string; name: string }): Player {
  const role: RoleIdentity = { id: 'sheriff', name: 'Sheriff', team: 'CIVILIAN', powerlevel: 3, abilityName: '', abilityDescription: '' };
  return {
    team: 'CIVILIAN', role, hand: [], inventory: [], money: 5, powerLevel: 3, actionsRemaining: 3,
    hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false, ...over,
  };
}

/** Stubs the clicked button's position so the popover's flip logic sees either plenty of room below, or none. */
function stubButtonRect(bottom: number) {
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom, top: bottom - 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: bottom - 40, toJSON() {},
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<PlayerSeat />', () => {
  it('opens the detail popover below the seat when there is room in the viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    stubButtonRect(100); // 700px of room below — plenty
    const player = mkPlayer({ id: 'p0', name: 'Ana' });
    render(<PlayerSeat player={player} />);

    fireEvent.click(screen.getByTitle('Ana — details'));
    const popover = screen.getByText('Ana', { selector: 'span.font-extrabold' }).closest('div.absolute');
    expect(popover).toHaveClass('top-full');
    expect(popover).not.toHaveClass('bottom-full');
  });

  it('flips the popover above the seat when opening below would run off the bottom of the viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    stubButtonRect(780); // only 20px of room below — not enough
    const player = mkPlayer({ id: 'p0', name: 'Ana' });
    render(<PlayerSeat player={player} />);

    fireEvent.click(screen.getByTitle('Ana — details'));
    const popover = screen.getByText('Ana', { selector: 'span.font-extrabold' }).closest('div.absolute');
    expect(popover).toHaveClass('bottom-full');
    expect(popover).not.toHaveClass('top-full');
  });
});
