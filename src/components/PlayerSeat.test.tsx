import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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
    // Portaled to <body> with fixed coordinates (see the anchor-tracking
    // fix) rather than the old `absolute` + top-full/bottom-full classes.
    const popover = screen.getByText('Ana', { selector: 'span.font-extrabold' }).closest('div.shadow-noir') as HTMLElement;
    expect(popover.style.top).toBe('104px'); // stubbed button bottom (100) + 4
    expect(popover.style.bottom).toBe('');
  });

  it('flips the popover above the seat when opening below would run off the bottom of the viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    stubButtonRect(780); // only 20px of room below — not enough
    const player = mkPlayer({ id: 'p0', name: 'Ana' });
    render(<PlayerSeat player={player} />);

    fireEvent.click(screen.getByTitle('Ana — details'));
    const popover = screen.getByText('Ana', { selector: 'span.font-extrabold' }).closest('div.shadow-noir') as HTMLElement;
    expect(popover.style.bottom).toBe('64px'); // viewport height (800) - stubbed button top (740) + 4
    expect(popover.style.top).toBe('');
  });

  it("gives every perk/weapon in another player's inventory the same name-plus-description tooltip a viewer gets on their own", () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    stubButtonRect(100);
    const player = mkPlayer({
      id: 'p0', name: 'Ana',
      inventory: [
        { id: 'w1', name: 'Bat', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 },
        { id: 'pk1', name: 'Computer', description: 'Draw a card at the start of your turn.', cost: 2, source: 'PUBLIC', type: 'PERK' },
      ],
    });
    render(<PlayerSeat player={player} />);

    fireEvent.click(screen.getByTitle('Ana — details'));
    // Weapons additionally surface their type (Melee/Ranged/Tech/Chemical) —
    // perks have no weaponType, so theirs stays name-plus-description only.
    expect(screen.getByText('Bat')).toHaveAttribute('title', 'Bat (Melee) — +2 power.');
    expect(screen.getByText('Computer')).toHaveAttribute('title', 'Computer — Draw a card at the start of your turn.');
  });

  it('portals the click-away backdrop straight to <body>, so it always covers the viewport regardless of any ancestor panel', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    stubButtonRect(100);
    const player = mkPlayer({ id: 'p0', name: 'Ana' });
    const { container } = render(
      // A backdrop-blur ancestor, like every real .panel the seat actually
      // renders inside — the bug this guards against only shows up when one
      // is present (see the ActionBar/DiscardPilePanel fixes for the same
      // containing-block issue).
      <div style={{ backdropFilter: 'blur(4px)' }}>
        <PlayerSeat player={player} />
      </div>,
    );

    fireEvent.click(screen.getByTitle('Ana — details'));
    const backdrop = document.querySelector('[aria-hidden="true"].fixed.inset-0');
    expect(backdrop).not.toBeNull();
    expect(container.contains(backdrop)).toBe(false); // escaped the blurred ancestor
    expect(document.body.contains(backdrop)).toBe(true);

    fireEvent.click(backdrop!);
    await waitFor(() => expect(screen.queryByText('Ana', { selector: 'span.font-extrabold' })).not.toBeInTheDocument());
  });
});
