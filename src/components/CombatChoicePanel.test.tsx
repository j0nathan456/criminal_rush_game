import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameState, Player, RoleIdentity, CombatState } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';
import { emptyGameState } from '../engine';
import { CombatChoicePanel } from './CombatChoicePanel';

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
const part = (playerId: string) => ({ playerId, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true });
function stateWith(players: Player[], combat: CombatState, over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, combat, ...over };
}

describe('<CombatChoicePanel />', () => {
  it('Portal: DRAW dispatches the draw choice', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'PRE', pending: [{ kind: 'PORTAL', playerId: 'a', weaponId: 'por', side: 'ATTACKER' }],
    };
    render(
      <CombatChoicePanel
        state={stateWith([holder, mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') })], combat)}
        viewerIndex={0}
        onCombatChoice={onCombatChoice}
      />,
    );
    fireEvent.click(screen.getByText('Draw 2 cards'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'PORTAL', mode: 'DRAW' });
  });

  it('Portal: picks a teammate first, then which of their two weapons to swap for — each hoverable like a Market card', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL'), money: 3 });
    const mate = mkPlayer({
      id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'),
      inventory: [
        { id: 'axe', name: 'Axe', description: '+5 power.', cost: 5, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 5 },
        { id: 'mos', name: 'Mosquitos', description: 'Before combat, opponent discards a card.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 3 },
      ],
    });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'PORTAL', playerId: 'a', weaponId: 'por', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={0} onCombatChoice={onCombatChoice} />);

    // No weapon chips until a teammate is picked.
    expect(screen.queryByText('Axe')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Sal'));

    const axeButton = screen.getByText('Axe').closest('button');
    const mosButton = screen.getByText('Mosquitos').closest('button');
    expect(axeButton).toHaveAttribute('title', 'Axe — +5 power.');
    expect(mosButton).toHaveAttribute('title', 'Mosquitos — Before combat, opponent discards a card.');

    fireEvent.click(screen.getByText('Mosquitos'));
    fireEvent.click(screen.getByText('Swap ($1)'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'PORTAL', mode: 'SWAP', teammateId: 'm', teammateWeaponId: 'mos' });
  });

  it('Leaving Evidence: the injured defender picks a card and shuffles it back', () => {
    const onCombatChoice = vi.fn();
    const ev: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') }), def], combat, { discardPile: [ev] });
    render(<CombatChoicePanel state={state} viewerIndex={1} onCombatChoice={onCombatChoice} />);
    fireEvent.click(screen.getByText('Time Evidence'));
    fireEvent.click(screen.getByText('Shuffle 1 back'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'LEAVING_EVIDENCE', evidenceIds: ['t1'] });
  });

  it('Drones: the holder never sees the teammate\'s hand — only their own card and a name to pick', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL'), hand: [{ id: 'mine', name: 'MyCard', description: '', type: 'MONEY' }] });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES', playerId: 'a', weaponId: 'dr', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={0} onCombatChoice={onCombatChoice} />);

    fireEvent.click(screen.getByText('MyCard'));
    fireEvent.click(screen.getByText('Sal'));
    expect(screen.queryByText('TheirCard')).not.toBeInTheDocument(); // never revealed to the holder

    fireEvent.click(screen.getByText('Exchange'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' });
  });

  it('Drones: the responding teammate picks from their own hand for the return', () => {
    const onCombatChoice = vi.fn();
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES_RETURN', playerId: 'm', holderId: 'a', holderCardId: 'mine', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={2} onCombatChoice={onCombatChoice} />);

    expect(screen.getByText(/Mona/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('TheirCard'));
    fireEvent.click(screen.getByText('Give card'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'DRONES_RETURN', cardId: 'theirs' });
  });

  it('Drones: everyone else sees a read-only waiting notice during the return step', () => {
    const holder = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const mate = mkPlayer({ id: 'm', name: 'Sal', role: role('spy', 'CRIMINAL'), hand: [{ id: 'theirs', name: 'TheirCard', description: '', type: 'MONEY' }] });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 3,
      phase: 'PRE', pending: [{ kind: 'DRONES_RETURN', playerId: 'm', holderId: 'a', holderCardId: 'mine', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([holder, def, mate], combat)} viewerIndex={0} />);
    expect(screen.getByText(/Waiting for Sal to choose a card to give back to Mona/)).toBeInTheDocument();
    expect(screen.queryByText('TheirCard')).not.toBeInTheDocument();
  });

  it('Leaving Evidence: hovering a card shows the categories it counts toward', () => {
    const ev: ActionCard = {
      id: 'ch1', name: 'Casino Heist', description: '', type: 'EVIDENCE', evidenceCategories: ['MOTIVE', 'LOCATION'],
    };
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') }), def], combat, { discardPile: [ev] });

    render(<CombatChoicePanel state={state} viewerIndex={1} />);
    expect(screen.getByText('Casino Heist').closest('button')).toHaveAttribute('title', 'Motive, Location');
  });

  it("Leaving Evidence: everyone but the injured defender sees a read-only waiting notice, not the picker", () => {
    const onCombatChoice = vi.fn();
    const ev: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN') });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' }],
    };
    const state = stateWith([attacker, def], combat, { discardPile: [ev] });

    // The attacker (e.g. a Criminal who just injured the defender) is not the decider.
    render(<CombatChoicePanel state={state} viewerIndex={0} onCombatChoice={onCombatChoice} />);
    expect(screen.getByText(/waiting for dee/i)).toBeInTheDocument();
    expect(screen.queryByText('Time Evidence')).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('Destroy Perk: the winner picks which of the loser’s perks to destroy', () => {
    const onCombatChoice = vi.fn();
    const radio: MarketCard = { id: 'r1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const computer: MarketCard = { id: 'c1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN'), inventory: [radio, computer] });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Missile', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([attacker, def], combat)} viewerIndex={0} onCombatChoice={onCombatChoice} />);

    expect(screen.getByText('Radio')).toBeInTheDocument();
    expect(screen.getByText('Computer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Computer'));
    fireEvent.click(screen.getByText('Destroy'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'DESTROY_PERK', perkId: 'c1' });
  });

  it('Destroy Perk: everyone but the winner sees a read-only waiting notice', () => {
    const onCombatChoice = vi.fn();
    const radio: MarketCard = { id: 'r1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({ id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN'), inventory: [radio] });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'AFTER', pending: [{ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Molotov Cocktail', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([attacker, def], combat)} viewerIndex={1} onCombatChoice={onCombatChoice} />);

    expect(screen.getByText(/Waiting for Mona to choose which of Dee's perks to destroy/)).toBeInTheDocument();
    expect(screen.queryByText('Radio')).not.toBeInTheDocument();
  });

  it('Barbed Wire: the opponent (not the holder) picks their own card to discard', () => {
    const onCombatChoice = vi.fn();
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({
      id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN'),
      hand: [{ id: 'keep', name: 'Keep', description: '', type: 'MONEY' }, { id: 'toss', name: 'Toss', description: '', type: 'MONEY' }],
    });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      // playerId is the defender — Barbed Wire's opponent, not Mona (its holder).
      phase: 'PRE', pending: [{ kind: 'BARBED_WIRE', playerId: 'd', weaponId: 'bw', side: 'ATTACKER' }],
    };
    render(<CombatChoicePanel state={stateWith([attacker, def], combat)} viewerIndex={1} onCombatChoice={onCombatChoice} />);

    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.getByText('Toss')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toss'));
    fireEvent.click(screen.getByText('Discard'));
    expect(onCombatChoice).toHaveBeenCalledWith({ kind: 'BARBED_WIRE', cardId: 'toss' });
  });

  it("Barbed Wire: everyone but the discarder — including the weapon's own holder — sees a read-only waiting notice", () => {
    const attacker = mkPlayer({ id: 'a', name: 'Mona', role: role('hitman', 'CRIMINAL') });
    const def = mkPlayer({
      id: 'd', name: 'Dee', role: role('mayor', 'CIVILIAN'),
      hand: [{ id: 'toss', name: 'Toss', description: '', type: 'MONEY' }],
    });
    const combat: CombatState = {
      attacker: part('a'), defender: part('d'), turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 2,
      phase: 'PRE', pending: [{ kind: 'BARBED_WIRE', playerId: 'd', weaponId: 'bw', side: 'ATTACKER' }],
    };
    // Mona holds Barbed Wire but isn't the one discarding — she still just waits.
    render(<CombatChoicePanel state={stateWith([attacker, def], combat)} viewerIndex={0} />);
    expect(screen.getByText(/Waiting for Dee to choose a card to discard for Barbed Wire/)).toBeInTheDocument();
    expect(screen.queryByText('Toss')).not.toBeInTheDocument();
  });
});
