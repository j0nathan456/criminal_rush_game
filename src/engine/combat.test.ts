import { describe, it, expect } from 'vitest';
import type { GameState, Player, RoleIdentity } from '../types/game.js';
import type { ActionCard, MarketCard, Team, WeaponType } from '../types/cards.js';
import { gameReducer, emptyGameState } from './reducer.js';
import { computeBasePower, weaponPower, attackActionCost, powerCardValue } from './combat.js';

// --- Fixtures ----------------------------------------------------------------

function role(id: string, team: Team, powerlevel = 3): RoleIdentity {
  return { id, name: id, team, powerlevel, abilityName: '', abilityDescription: '' };
}

function mkPlayer(over: Partial<Player> & { id: string; role: RoleIdentity }): Player {
  return {
    name: over.id,
    team: over.role.team,
    hand: [],
    inventory: [],
    money: 5,
    powerLevel: over.role.powerlevel,
    actionsRemaining: 3,
    hasPurchasedFromMarket: false,
    hasUsedRoleAbility: false,
    hasAttacked: false,
    isInjured: false,
    isExposed: false,
    isCaptured: false,
    ...over,
  };
}

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, currentPlayerIndex: 0, vpTargets: { CIVILIAN: 99, CRIMINAL: 99 }, ...over };
}

const wpn = (id: string, name: string, weaponType: WeaponType, power: number, over: Partial<MarketCard> = {}): MarketCard => ({
  id, name, description: '', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType, power, ...over,
});
const perk = (id: string, name: string, over: Partial<MarketCard> = {}): MarketCard => ({
  id, name, description: '', cost: 2, source: 'PUBLIC', type: 'PERK', ...over,
});
const pow = (id: string, name: string, power: number): ActionCard => ({ id, name, description: '', type: 'POWER', power });
const junk = (id: string): ActionCard => ({ id, name: `junk-${id}`, description: '', type: 'MONEY', value: 1 });

const ATK = { isAttacker: true, playerCount: 4 };
const DEF = { isAttacker: false, playerCount: 4 };

// --- weaponPower / computeBasePower -----------------------------------------

describe('weaponPower — conditionals & scaling', () => {
  const hitman = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });

  it('adds +2 when a conditional weapon matches the opponent’s class', () => {
    const meleeFoe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('m', 'Bat', 'MELEE', 2)] });
    // Harpoon: +2, +2 more vs a Melee opponent.
    expect(weaponPower(wpn('h', 'Harpoon', 'RANGED', 2), hitman, meleeFoe, 4)).toBe(4);
    // No melee opponent → just +2.
    const bareFoe = mkPlayer({ id: 'c', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(wpn('h', 'Harpoon', 'RANGED', 2), hitman, bareFoe, 4)).toBe(2);
  });

  it('Parasites equals the opponent’s role base PL', () => {
    const foe = mkPlayer({ id: 'b', role: role('spy', 'CRIMINAL', 4) });
    expect(weaponPower(wpn('p', 'Parasites', 'CHEMICAL', 0), hitman, foe, 4)).toBe(4);
  });

  it('Pocket Knife counts perks + weapons (including itself)', () => {
    const knife = wpn('k', 'Pocket Knife', 'MELEE', 0);
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [knife, perk('x', 'Radio'), perk('y', 'Bank')] });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(knife, self, foe, 4)).toBe(3); // 3 items
  });

  it('Robot Soldier caps at +5 and Cannon caps at +4', () => {
    const bigHand = Array.from({ length: 8 }, (_, i) => junk(`h${i}`));
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), hand: bigHand });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), hand: bigHand });
    expect(weaponPower(wpn('r', 'Robot Soldier', 'TECH', 0), self, foe, 4)).toBe(5);
    expect(weaponPower(wpn('c', 'Cannon', 'RANGED', 0), self, foe, 4)).toBe(4);
  });

  it('Catapult is +3 in a 4-player game, +2 otherwise', () => {
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(wpn('c', 'Catapult', 'RANGED', 2), self, foe, 4)).toBe(3);
    expect(weaponPower(wpn('c', 'Catapult', 'RANGED', 2), self, foe, 6)).toBe(2);
  });

  it('Laboratory/Ironworks buff the matching weapon classes', () => {
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const lab = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('l', 'Laboratory')] });
    expect(weaponPower(wpn('t', 'Toxic Gas', 'CHEMICAL', 2), lab, foe, 4)).toBe(3); // +1 chemical
    const iron = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('i', 'Ironworks')] });
    expect(weaponPower(wpn('bt', 'Bat', 'MELEE', 2), iron, foe, 4)).toBe(3); // +1 melee
  });
});

describe('computeBasePower', () => {
  it('reproduces the rulebook worked example base powers (Hitman 8, Mayor 9)', () => {
    const hitman = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('ham', 'Hammer', 'MELEE', 2), wpn('bw', 'Barbed Wire', 'MELEE', 1)],
    });
    const mayor = mkPlayer({
      id: 'b', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('harp', 'Harpoon', 'RANGED', 2), wpn('par', 'Parasites', 'CHEMICAL', 0)],
    });
    // Hitman: 3 + Hammer 2 + Barbed Wire 1 + Marksman (+1 per weapon × 2) = 8.
    expect(computeBasePower(hitman, mayor, ATK)).toBe(8);
    // Mayor: 2 + Harpoon (2 +2 vs melee) + Parasites (= Hitman base 3) = 9.
    expect(computeBasePower(mayor, hitman, DEF)).toBe(9);
  });

  it('applies the Bodyguard token only on defence', () => {
    const foe = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const guarded = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true });
    expect(computeBasePower(guarded, foe, DEF)).toBe(4); // 2 + 2 token
    expect(computeBasePower(guarded, foe, ATK)).toBe(2); // no bonus on attack
  });
});

describe('attackActionCost', () => {
  it('is 2 normally, 1 with Getaway Car, and +1 vs Nerve Agents', () => {
    const plain = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    expect(attackActionCost(plain, foe)).toBe(2);

    const getaway = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('g', 'Getaway Car')] });
    expect(attackActionCost(getaway, foe)).toBe(1);

    const nerved = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('n', 'Nerve Agents', 'CHEMICAL', 1)] });
    expect(attackActionCost(plain, nerved)).toBe(3);
  });
});

describe('powerCardValue', () => {
  it('adds +1 for Mafia Alliance and lets Mirror copy an earlier card’s base PL', () => {
    const mafioso = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('ma', 'Mafia Alliance')] });
    expect(powerCardValue(pow('s', 'Surge', 2), mafioso, [])).toEqual({ basePower: 2, power: 3 });

    const plain = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const played = [{ cardId: 'ua', name: 'Unexpected Allies', byPlayerId: 'z', side: 'DEFENDER' as const, power: 2, basePower: 2 }];
    expect(powerCardValue(pow('mir', 'Mirror', 0), plain, played)).toEqual({ basePower: 2, power: 2 });
  });
});

// --- Full interactive combat (worked example, rulebook p.9-10) ---------------

describe('interactive combat — rulebook worked example', () => {
  it('resolves Hitman 12 vs Mayor 11 → Hitman wins', () => {
    const hitman = mkPlayer({
      id: 'hit', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('ham', 'Hammer', 'MELEE', 2), wpn('bw', 'Barbed Wire', 'MELEE', 1)],
      hand: [pow('surge', 'Surge', 2)],
    });
    const mayor = mkPlayer({
      id: 'may', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('harp', 'Harpoon', 'RANGED', 2), wpn('par', 'Parasites', 'CHEMICAL', 0)],
      hand: [junk('m1')], // Barbed Wire makes the Mayor discard this
    });
    const ally = mkPlayer({ id: 'ally', role: role('attorney', 'CIVILIAN', 3), hand: [pow('ua', 'Unexpected Allies', 2)] });

    // Seats [Mayor, Hitman, Ally]: Hitman (index 1) neighbours both, and it is his turn.
    const s = stateWith([mayor, hitman, ally], { currentPlayerIndex: 1, drawPile: [pow('mir', 'Mirror', 0)] });

    // Initiate: Hammer draws the Mirror into the Hitman's hand; Barbed Wire makes the Mayor discard.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'may' });
    expect(next.combat).not.toBeNull();
    expect(next.combat!.attacker.basePower).toBe(8);
    expect(next.combat!.defender.basePower).toBe(9);
    expect(next.players[1].hand.some((c) => c.name === 'Mirror')).toBe(true); // Hammer drew it
    expect(next.players[0].hand).toHaveLength(0); // Barbed Wire discarded the Mayor's junk

    // Power phase.
    next = gameReducer(next, { type: 'PLAY_POWER', cardId: 'surge', side: 'ATTACKER', byPlayerId: 'hit' });
    next = gameReducer(next, { type: 'PLAY_POWER', cardId: 'ua', side: 'DEFENDER', byPlayerId: 'ally' });
    next = gameReducer(next, { type: 'PLAY_POWER', cardId: 'mir', side: 'ATTACKER', byPlayerId: 'hit' }); // copies UA (+2)
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });

    // 8 + (Surge 2 + Mirror 2) = 12 vs 9 + (UA 2) = 11.
    expect(next.combat).toBeNull();
    expect(next.players[0].isInjured).toBe(true); // Mayor injured
    expect(next.teamScores.CRIMINAL).toBe(1);
  });
});

// --- Power-phase rule guards -------------------------------------------------

describe('interactive combat — rule guards', () => {
  const setupFight = (over: { atkInv?: MarketCard[]; defInv?: MarketCard[]; atkHand?: ActionCard[]; defHand?: ActionCard[] } = {}) => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), inventory: over.atkInv ?? [], hand: over.atkHand ?? [] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), inventory: over.defInv ?? [], hand: over.defHand ?? [] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    return gameReducer(s, { type: 'ATTACK', targetId: 'def' });
  };

  it('Signal Jammer stops the opponent from playing Power cards', () => {
    const fight = setupFight({ atkInv: [wpn('sj', 'Signal Jammer', 'TECH', 2)], defHand: [pow('b', 'Boost', 1)] });
    expect(fight.combat!.defender.canPlayPower).toBe(false);
    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b', side: 'DEFENDER', byPlayerId: 'def' });
    expect(after.combat!.defender.powerCardBonus).toBe(0); // rejected
  });

  it('rejects Shield played on the attacker (defence only)', () => {
    const fight = setupFight({ atkHand: [pow('sh', 'Shield', 3)] });
    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'sh', side: 'ATTACKER', byPlayerId: 'atk' });
    expect(after.combat!.attacker.powerCardBonus).toBe(0);
  });

  it('rejects Unexpected Allies played for yourself', () => {
    const fight = setupFight({ atkHand: [pow('ua', 'Unexpected Allies', 2)] });
    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'ua', side: 'ATTACKER', byPlayerId: 'atk' });
    expect(after.combat!.attacker.powerCardBonus).toBe(0);
  });

  it('Machine Gun discards Money cards for +1 power each', () => {
    const fight = setupFight({ atkInv: [wpn('mg', 'Machine Gun', 'RANGED', 3)], atkHand: [junk('a'), junk('b')] });
    const after = gameReducer(fight, { type: 'COMBAT_DISCARD_MONEY', side: 'ATTACKER', cardIds: ['a', 'b'] });
    expect(after.combat!.attacker.powerCardBonus).toBe(2);
    expect(after.players[0].hand).toHaveLength(0);
  });
});

// --- Outcomes ----------------------------------------------------------------

describe('interactive combat — outcomes', () => {
  it('a Civilian captures an exposed Criminal on a win', () => {
    const civ = mkPlayer({ id: 'c', role: role('sheriff', 'CIVILIAN', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const crim = mkPlayer({ id: 'x', role: role('robber', 'CRIMINAL', 2), isExposed: true });
    const s = stateWith([civ, crim], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'x' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.players[1].isCaptured).toBe(true);
    expect(next.players[1].isExposed).toBe(false);
    expect(next.teamScores.CIVILIAN).toBe(1);
  });

  it('Viruses hands the opponent a Virus token and Missile destroys a perk on a win', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('mis', 'Missile', 'TECH', 2), wpn('vir', 'Viruses', 'CHEMICAL', 2)],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [perk('rp', 'Radio')] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    // Attacker base 3 + 2 + 2 + Marksman 2 = 9 vs 2 → wins.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.players[1].inventory.some((c) => c.name === 'Radio')).toBe(false); // Missile destroyed it
    expect(next.players[1].virusTokens).toBe(1); // Viruses token
  });

  it('a Virus token costs an action at the start of the next turn', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), virusTokens: 1 }),
    ]);
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[1].actionsRemaining).toBe(3); // Mayor 4 − 1 virus
    expect(next.players[1].virusTokens).toBe(0);
  });
});

// --- Interactive pre/post-combat choices -------------------------------------

describe('interactive combat — pre-combat choices', () => {
  it('opens a PRE phase for Portal and draws 2 on the DRAW choice', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('por', 'Portal', 'TECH', 0)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0, drawPile: [junk('x'), junk('y'), junk('z')] });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.phase).toBe('PRE');
    expect(next.combat!.pending[0].kind).toBe('PORTAL');
    expect(next.players[0].hand).toHaveLength(0); // not drawn yet

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'PORTAL', mode: 'DRAW' } });
    expect(next.combat!.phase).toBe('POWER'); // PRE queue drained
    expect(next.players[0].hand).toHaveLength(2); // Portal drew 2
  });

  it('Portal SWAP trades the weapon with a teammate for $1', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), money: 3, inventory: [wpn('por', 'Portal', 'TECH', 0)] });
    const mate = mkPlayer({ id: 'm', role: role('spy', 'CRIMINAL', 4), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    // Seats [atk, def, mate] so atk neighbours def.
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'PORTAL', mode: 'SWAP', teammateId: 'm', teammateWeaponId: 'axe' } });
    expect(next.players[0].inventory.some((c) => c.name === 'Axe')).toBe(true);
    expect(next.players[0].money).toBe(2); // paid $1
    expect(next.players[2].inventory.some((c) => c.name === 'Portal')).toBe(true);
    // Base power now reflects the Axe (+5) + Hitman (+1 weapon) = 3 + 5 + 1 = 9.
    expect(next.combat!.attacker.basePower).toBe(9);
  });

  it('Mutants copies an opponent weapon’s power', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.pending[0].kind).toBe('MUTANTS');
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'axe' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Axe 5 = 10.
    expect(next.combat!.attacker.basePower).toBe(10);
  });

  it('Drones exchanges a card with a teammate', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('dr', 'Drones', 'TECH', 2)], hand: [junk('mine')] });
    const mate = mkPlayer({ id: 'm', role: role('spy', 'CRIMINAL', 4), hand: [junk('theirs')] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm', teammateCardId: 'theirs' } });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['theirs']);
    expect(next.players[2].hand.map((c) => c.id)).toEqual(['mine']);
  });
});

describe('interactive combat — Leaving Evidence (AFTER phase)', () => {
  it('lets the beaten Civilian shuffle discarded Evidence back into the deck', () => {
    const ev1: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0, discardPile: [ev1] });

    // Attacker 3 + 5 + 1 = 9 beats Mayor 2.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.phase).toBe('AFTER'); // waiting on Leaving Evidence
    expect(next.players[1].isInjured).toBe(true);
    expect(next.teamScores.CRIMINAL).toBe(1);

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'LEAVING_EVIDENCE', evidenceIds: ['t1'] } });
    expect(next.combat).toBeNull(); // fight closed
    expect(next.drawPile.some((c) => c.id === 't1')).toBe(true); // reclaimed
    expect(next.discardPile.some((c) => c.id === 't1')).toBe(false);
  });

  it('closes immediately with no reclaimable evidence', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat).toBeNull(); // no AFTER phase without discard evidence
    expect(next.players[1].isInjured).toBe(true);
  });
});
