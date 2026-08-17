import { describe, it, expect } from 'vitest';
import type { GameState, Player, RoleIdentity } from '../types/game.js';
import type { ActionCard, MarketCard, Team, WeaponType } from '../types/cards.js';
import { gameReducer, emptyGameState } from './reducer.js';
import { computeBasePower, weaponPower, attackActionCost, powerCardValue, powerCardEligible } from './combat.js';
import { shuffle } from './deck.js';

/** Deterministic PRNG (mulberry32) so shuffle assertions are reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

describe('enterPowerPhase — weapon effect case-log entries', () => {
  it('logs Harpoon’s conditional bonus and Parasites’ PL match', () => {
    const hitman = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('ham', 'Hammer', 'MELEE', 2), wpn('bw', 'Barbed Wire', 'MELEE', 1)],
    });
    const mayor = mkPlayer({
      id: 'b', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('harp', 'Harpoon', 'RANGED', 2), wpn('par', 'Parasites', 'CHEMICAL', 0)],
    });
    const s = stateWith([hitman, mayor], { currentPlayerIndex: 0, drawPile: [junk('x')] });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'b' });
    expect(next.gameLog).toContain('Harpoon gets +2 PL against a Melee weapon.');
    expect(next.gameLog).toContain("Parasites matches a's Base PL (3).");
  });

  it('logs Laboratory/Ironworks weapon buffs only when they actually apply', () => {
    const lab = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('tg', 'Toxic Gas', 'CHEMICAL', 2), perk('l', 'Laboratory')],
    });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([lab, foe], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'b' });
    expect(next.gameLog).toContain('Toxic Gas gets +1 PL from Laboratory.');
  });

  it('does not log a weapon with only its flat printed power and no conditional', () => {
    const plain = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('bt', 'Bat', 'MELEE', 2)] });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([plain, foe], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'b' });
    expect(next.gameLog.some((line) => line.includes('Bat'))).toBe(false);
  });

  it('logs the scaling weapons’ computed value every time (Pocket Knife, Robot Soldier, Cannon, Catapult)', () => {
    const self = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('pk', 'Pocket Knife', 'MELEE', 0)],
    });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([self, foe], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'b' });
    expect(next.gameLog).toContain("Pocket Knife scales with a's perks/weapons (+1 PL).");
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
    expect(powerCardValue(pow('mir', 'Mirror', 0), plain, played)).toEqual({ basePower: 2, power: 2, copiedCardName: 'Unexpected Allies' });
  });
});

describe('powerCardEligible', () => {
  const combatant = mkPlayer({ id: 'c', role: role('mayor', 'CIVILIAN', 2) });
  const teammate = mkPlayer({ id: 't', role: role('attorney', 'CIVILIAN', 3) });
  const bodyguard = mkPlayer({ id: 'g', role: role('bodyguard', 'CIVILIAN', 3) });
  const enemy = mkPlayer({ id: 'e', role: role('hitman', 'CRIMINAL', 3) });

  it('lets the combatant play any Power card for themselves (except Unexpected Allies)', () => {
    expect(powerCardEligible(pow('b', 'Boost', 1), combatant, combatant, 'ATTACKER', []).enabled).toBe(true);
    expect(powerCardEligible(pow('ua', 'Unexpected Allies', 2), combatant, combatant, 'ATTACKER', []).enabled).toBe(false);
  });

  it('refuses a teammate who is not the Bodyguard, but always allows Unexpected Allies from a teammate', () => {
    expect(powerCardEligible(pow('b', 'Boost', 1), teammate, combatant, 'ATTACKER', []).enabled).toBe(false);
    expect(powerCardEligible(pow('ua', 'Unexpected Allies', 2), teammate, combatant, 'ATTACKER', []).enabled).toBe(true);
    expect(powerCardEligible(pow('ua', 'Unexpected Allies', 2), enemy, combatant, 'ATTACKER', []).enabled).toBe(false); // not even a teammate
  });

  it('lets the active Bodyguard play any Power card for their protected teammate', () => {
    const protectedCombatant = { ...combatant, hasBodyguardToken: true };
    expect(powerCardEligible(pow('b', 'Boost', 1), bodyguard, protectedCombatant, 'ATTACKER', []).enabled).toBe(true);
    // Not protecting anyone right now — the token matters, not just the role.
    expect(powerCardEligible(pow('b', 'Boost', 1), bodyguard, combatant, 'ATTACKER', []).enabled).toBe(false);
  });

  it('refuses Shield on offence', () => {
    expect(powerCardEligible(pow('s', 'Shield', 3), combatant, combatant, 'ATTACKER', []).enabled).toBe(false);
    expect(powerCardEligible(pow('s', 'Shield', 3), combatant, combatant, 'DEFENDER', []).enabled).toBe(true);
  });

  it('refuses Mirror until someone else has played a Power card this combat', () => {
    expect(powerCardEligible(pow('m', 'Mirror', 0), combatant, combatant, 'ATTACKER', []).enabled).toBe(false);
    const played = [{ cardId: 's', name: 'Surge', byPlayerId: 'e', side: 'DEFENDER' as const, power: 2, basePower: 2 }];
    expect(powerCardEligible(pow('m', 'Mirror', 0), combatant, combatant, 'ATTACKER', played).enabled).toBe(true);
    // Only your own prior plays don't count.
    const ownPlay = [{ cardId: 'b', name: 'Boost', byPlayerId: 'c', side: 'ATTACKER' as const, power: 1, basePower: 1 }];
    expect(powerCardEligible(pow('m', 'Mirror', 0), combatant, combatant, 'ATTACKER', ownPlay).enabled).toBe(false);
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

  it('rejects a non-Bodyguard teammate playing a Power card for the combatant, but allows the active Bodyguard', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3) });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true });
    const mate = mkPlayer({ id: 'mate', role: role('attorney', 'CIVILIAN', 3), hand: [pow('b1', 'Boost', 1)] });
    const guard = mkPlayer({ id: 'grd', role: role('bodyguard', 'CIVILIAN', 3), hand: [pow('b2', 'Boost', 1)] });
    const s = stateWith([atk, def, mate, guard], { currentPlayerIndex: 0 });
    const fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });

    const afterMate = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b1', side: 'DEFENDER', byPlayerId: 'mate' });
    expect(afterMate.combat!.defender.powerCardBonus).toBe(0); // not the Bodyguard — rejected
    expect(afterMate.players.find((p) => p.id === 'mate')!.hand).toHaveLength(1); // card untouched

    const afterGuard = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b2', side: 'DEFENDER', byPlayerId: 'grd' });
    expect(afterGuard.combat!.defender.powerCardBonus).toBe(1); // active Bodyguard — allowed
  });

  it('rejects Mirror before anyone else has played a Power card, and logs the copy once one has', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('m', 'Mirror', 0)] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), hand: [pow('s', 'Surge', 2)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });

    const early = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'm', side: 'ATTACKER', byPlayerId: 'atk' });
    expect(early.combat!.attacker.powerCardBonus).toBe(0); // nothing to copy yet
    expect(early.players.find((p) => p.id === 'atk')!.hand.some((c) => c.id === 'm')).toBe(true); // still in hand

    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 's', side: 'DEFENDER', byPlayerId: 'def' });
    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'm', side: 'ATTACKER', byPlayerId: 'atk', mirrorTargetCardId: 's' });
    expect(after.combat!.attacker.powerCardBonus).toBe(2); // copied Surge's +2
    expect(after.gameLog.at(-1)).toBe('atk used Mirror to copy Surge to get +2 PL.');
  });

  it('rejects an explicit mirrorTargetCardId that was not actually played by someone else', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('m', 'Mirror', 0), pow('b', 'Boost', 1)] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b', side: 'ATTACKER', byPlayerId: 'atk' }); // own play, doesn't count

    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'm', side: 'ATTACKER', byPlayerId: 'atk', mirrorTargetCardId: 'b' });
    expect(after.combat!.attacker.powerCardBonus).toBe(1); // unchanged — still just Boost's +1
    expect(after.players.find((p) => p.id === 'atk')!.hand.some((c) => c.id === 'm')).toBe(true); // Mirror rejected, stays in hand
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

  it('Mutants copying Mosquitos also forces this fight’s opponent to discard — not just its power', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)], hand: [junk('atk-card')],
    });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('mos', 'Mosquitos', 'CHEMICAL', 3)], hand: [junk('def-card')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    // The defender's own Mosquitos already fired automatically pre-combat,
    // discarding the attacker's card — unrelated to the Mutants copy below.
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id)).toContain('atk-card');
    expect(next.players[1].hand).toHaveLength(1); // defender's own card untouched so far

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'mos' } });
    // The copied Mosquitos now forces the opponent it was copied from — the
    // defender — to discard too. Never anyone else.
    expect(next.players[1].hand).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id)).toContain('def-card');
  });

  it('Mutants copying Hammer draws the holder a card, not the opponent', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('ham', 'Hammer', 'MELEE', 2)] });
    // Two cards: the defender's own Hammer draws the first before the PRE
    // phase even opens; the Mutants-copied Hammer should draw the second.
    const s = stateWith([atk, def], { currentPlayerIndex: 0, drawPile: [junk('def-drawn'), junk('atk-drawn')] });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['def-drawn']); // defender's own Hammer already fired

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'ham' } });
    expect(next.players[0].hand.map((c) => c.id)).toContain('atk-drawn'); // the copy draws for the holder
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['def-drawn']); // defender's hand unaffected by the copy
  });

  it('Mutants copying Brass Knuckles steals $1 from the copied-from opponent while the holder is attacking', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)], money: 0 });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('bk', 'Brass Knuckles', 'MELEE', 1)], money: 3 });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'bk' } });
    expect(next.players[0].money).toBe(1);
    expect(next.players[1].money).toBe(2);
  });

  it('Mutants only affects the direct combat opponent — a third player is untouched', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('mos', 'Mosquitos', 'CHEMICAL', 3)], hand: [junk('def-card')],
    });
    const bystander = mkPlayer({ id: 'x', role: role('sheriff', 'CIVILIAN', 3), hand: [junk('bystander-card')] });
    const s = stateWith([atk, def, bystander], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'mos' } });
    expect(next.players[2].hand.map((c) => c.id)).toEqual(['bystander-card']); // never touched
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

  it('Pistol lets the holder choose which card to discard, not a random/first one', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('pis', 'Pistol', 'RANGED', 4)],
      hand: [junk('keep'), junk('toss')],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.phase).toBe('PRE');
    expect(next.combat!.pending[0].kind).toBe('PISTOL');
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['keep', 'toss']); // untouched until chosen

    // Choosing the second card (not hand[0]) proves it's a real choice, not
    // a stand-in for "discard the first/a random card".
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'PISTOL', cardId: 'toss' } });
    expect(next.combat!.phase).toBe('POWER'); // PRE queue drained
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['keep']);
    expect(next.discardPile.map((c) => c.id)).toContain('toss');
  });

  it('Pistol is skipped ("if possible") when the holder has no cards to discard', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('pis', 'Pistol', 'RANGED', 4)], hand: [] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.phase).toBe('POWER'); // no PRE choice queued — nothing to discard
  });
});

describe("interactive combat — Nurse's Triage (AFTER phase)", () => {
  it('offers Triage and prevents the injury when the Nurse heals', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 3), hand: [junk('bandage')] });
    const s = stateWith([atk, def, nurse], { currentPlayerIndex: 0 });

    // Attacker 3 + 5 + 1 (Marksman) = 9 beats Mayor 2.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.phase).toBe('AFTER');
    expect(next.combat!.pending[0]).toEqual({ kind: 'NURSE_HEAL', playerId: 'n', injuredId: 'd', side: 'DEFENDER' });
    expect(next.players[1].isInjured).toBe(false); // not injured yet — pending the Nurse's choice
    expect(next.teamScores.CRIMINAL).toBe(1); // the VP still lands regardless of Triage

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'NURSE_HEAL', mode: 'HEAL', cardId: 'bandage' } });
    expect(next.combat).toBeNull();
    expect(next.players[1].isInjured).toBe(false); // prevented, not just healed after the fact
    expect(next.players[2].hand).toHaveLength(0); // the Nurse's card was spent
    expect(next.discardPile.map((c) => c.id)).toContain('bandage');
    expect(next.players[2].actionsRemaining).toBe(3); // free — no action spent
  });

  it('injures the teammate as normal when the Nurse skips', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 3), hand: [junk('bandage')] });
    const s = stateWith([atk, def, nurse], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'NURSE_HEAL', mode: 'SKIP' } });
    expect(next.combat).toBeNull();
    expect(next.players[1].isInjured).toBe(true);
    expect(next.players[2].hand).toHaveLength(1); // untouched
  });

  it('chains into Leaving Evidence when the Nurse skips and Evidence is in the discard', () => {
    const ev1: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 3), hand: [junk('bandage')] });
    const s = stateWith([atk, def, nurse], { currentPlayerIndex: 0, discardPile: [ev1] });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'NURSE_HEAL', mode: 'SKIP' } });
    expect(next.combat!.phase).toBe('AFTER');
    expect(next.combat!.pending[0]).toEqual({ kind: 'LEAVING_EVIDENCE', playerId: 'd', side: 'DEFENDER' });
    expect(next.players[1].isInjured).toBe(true);
  });

  it('skips straight to injury when the only Nurse is herself injured', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 3), hand: [junk('bandage')], isInjured: true });
    const s = stateWith([atk, def, nurse], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    let final = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    final = gameReducer(final, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(final.combat).toBeNull(); // no NURSE_HEAL choice — the Nurse herself is unavailable
    expect(final.players[1].isInjured).toBe(true);
  });

  it('skips straight to injury when the Nurse has no card to discard', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 3), hand: [] });
    const s = stateWith([atk, def, nurse], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat).toBeNull();
    expect(next.players[1].isInjured).toBe(true);
  });

  it("does not offer Triage on the Nurse's own injury (she can't heal herself)", () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const nurse = mkPlayer({ id: 'n', role: role('nurse', 'CIVILIAN', 2), hand: [junk('bandage')] });
    const s = stateWith([atk, nurse], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'n' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat).toBeNull();
    expect(next.players[1].isInjured).toBe(true);
    expect(next.players[1].hand).toHaveLength(1); // never touched
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

  it('genuinely shuffles the reclaimed cards into the deck rather than stacking them on top', () => {
    const ev1: ActionCard = { id: 't1', name: 'Time Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['TIME'] };
    const ev2: ActionCard = { id: 't2', name: 'Means Evidence', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const filler = [junk('f1'), junk('f2'), junk('f3'), junk('f4'), junk('f5')];
    const s = stateWith([atk, def], { currentPlayerIndex: 0, discardPile: [ev1, ev2], drawPile: filler });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });

    next = gameReducer(
      next,
      { type: 'COMBAT_CHOICE', input: { kind: 'LEAVING_EVIDENCE', evidenceIds: ['t1', 't2'] } },
      seeded(42),
    );

    // Matches a plain shuffle() of the same cards under the same seed — proof
    // it's a real Fisher-Yates shuffle, not [...taken, ...drawPile].
    const expected = shuffle([ev1, ev2, ...filler], seeded(42));
    expect(next.drawPile.map((c) => c.id)).toEqual(expected.map((c) => c.id));
    expect(next.drawPile.map((c) => c.id)).not.toEqual(['t1', 't2', 'f1', 'f2', 'f3', 'f4', 'f5']);
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
