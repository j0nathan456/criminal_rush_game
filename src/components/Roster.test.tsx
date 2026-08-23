import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Player, RoleIdentity } from '../types/game';
import { Roster } from './Roster';

function role(id: string, team: RoleIdentity['team']): RoleIdentity {
  return { id, name: id, team, powerlevel: 3, abilityName: '', abilityDescription: '' };
}
function mkPlayer(id: string, name: string, team: RoleIdentity['team']): Player {
  return {
    id, name, team, role: role(`${id}-role`, team), hand: [], inventory: [], money: 5, powerLevel: 3,
    actionsRemaining: 3, hasPurchasedFromMarket: false, hasUsedRoleAbility: false, hasAttacked: false,
    isInjured: false, isExposed: false, isCaptured: false,
  };
}

/** The full 8-player table (rulebook max — see MAX_PLAYERS in online/room.ts). */
const eightPlayers: Player[] = [
  mkPlayer('p0', 'Ava', 'CIVILIAN'),
  mkPlayer('p1', 'Ben', 'CRIMINAL'),
  mkPlayer('p2', 'Cara', 'CIVILIAN'),
  mkPlayer('p3', 'Dev', 'CRIMINAL'),
  mkPlayer('p4', 'Eli', 'CIVILIAN'),
  mkPlayer('p5', 'Fay', 'CRIMINAL'),
  mkPlayer('p6', 'Gia', 'CIVILIAN'),
  mkPlayer('p7', 'Hal', 'CRIMINAL'),
];

describe('<Roster /> at the 8-player max', () => {
  it('lists all 8 players, none dropped or duplicated', () => {
    render(
      <Roster
        players={eightPlayers}
        currentPlayerIndex={0}
        viewerIndex={-1} // no "(you)" suffix in play — keeps names exact for this check
        targeting={false}
        isTargetable={() => false}
        defaultOpen
      />,
    );
    for (const p of eightPlayers) {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    }
    expect(screen.getAllByTitle(/— details/)).toHaveLength(8);
  });

  it('flips the last seat’s detail popover upward — it has the least room below in a full 8-seat list', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    // Every button reports the same low position, simulating the last row
    // of a long, expanded roster sitting near the bottom of the viewport.
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 780, top: 740, left: 0, right: 200, width: 200, height: 40, x: 0, y: 740, toJSON() {},
    });

    render(
      <Roster
        players={eightPlayers}
        currentPlayerIndex={0}
        viewerIndex={0}
        targeting={false}
        isTargetable={() => false}
        defaultOpen
      />,
    );
    fireEvent.click(screen.getByTitle('Hal — details')); // the last (8th) seat
    const popover = screen.getByText('Hal', { selector: 'span.font-extrabold' }).closest('div.absolute');
    expect(popover).toHaveClass('bottom-full');
    expect(popover).not.toHaveClass('top-full');

    vi.restoreAllMocks();
  });

  it('targeting mode only offers "Select" on eligible seats across the full table — the rest still just open their own detail popover', () => {
    const onSelectTarget = vi.fn();
    // Only Criminal seats are eligible (e.g. an Expose), as a stand-in for
    // whatever real eligibility rule the caller supplies.
    const isTargetable = (p: Player) => p.team === 'CRIMINAL';

    render(
      <Roster
        players={eightPlayers}
        currentPlayerIndex={0}
        viewerIndex={0}
        targeting
        isTargetable={isTargetable}
        onSelectTarget={onSelectTarget}
      />,
    );
    expect(screen.getByText('Pick a highlighted player.')).toBeInTheDocument();

    // Every Criminal seat (all 4, spread across the full 8-seat table) is selectable.
    for (const p of eightPlayers.filter((p) => p.team === 'CRIMINAL')) {
      expect(screen.getByTitle(`Select ${p.name}`)).toBeInTheDocument();
    }
    // Civilian seats are never offered as a target, even while targeting is active.
    for (const p of eightPlayers.filter((p) => p.team === 'CIVILIAN')) {
      expect(screen.queryByTitle(`Select ${p.name}`)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByTitle('Select Ben'));
    expect(onSelectTarget).toHaveBeenCalledWith('p1');
  });
});
