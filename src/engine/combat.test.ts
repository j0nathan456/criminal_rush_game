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

const ATK = { isAttacker: true, areNeighbors: true };
const DEF = { isAttacker: false, areNeighbors: true };

// --- weaponPower / computeBasePower -----------------------------------------

describe('weaponPower — conditionals & scaling', () => {
  const hitman = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });

  it('adds +2 when a conditional weapon matches the opponent’s class', () => {
    const meleeFoe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('m', 'Bat', 'MELEE', 2)] });
    // Harpoon: +2, +2 more vs a Melee opponent.
    expect(weaponPower(wpn('h', 'Harpoon', 'RANGED', 2), hitman, meleeFoe, true)).toBe(4);
    // No melee opponent → just +2.
    const bareFoe = mkPlayer({ id: 'c', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(wpn('h', 'Harpoon', 'RANGED', 2), hitman, bareFoe, true)).toBe(2);
  });

  it('Parasites equals the opponent’s role base PL', () => {
    const foe = mkPlayer({ id: 'b', role: role('spy', 'CRIMINAL', 4) });
    expect(weaponPower(wpn('p', 'Parasites', 'CHEMICAL', 0), hitman, foe, true)).toBe(4);
  });

  it('Parasites still matches only the Vigilante’s base PL, not their VP-stacked current PL', () => {
    // Base PL 2, but boosted to 5 by 3 Vengeance stacks (max +3) from Criminal VPs.
    const boostedVigilante = mkPlayer({ id: 'v', role: role('vigilante', 'CIVILIAN', 2), powerLevel: 5, vigilanteStacks: 3 });
    expect(weaponPower(wpn('p', 'Parasites', 'CHEMICAL', 0), hitman, boostedVigilante, true)).toBe(2);
  });

  it('Parasites still matches the full base PL of an exposed Criminal, ignoring their -1 PL penalty', () => {
    // Base PL 3, but reduced to 2 by Expose's -1 PL penalty.
    const exposedCriminal = mkPlayer({ id: 'x', role: role('robber', 'CRIMINAL', 3), powerLevel: 2, isExposed: true });
    expect(weaponPower(wpn('p', 'Parasites', 'CHEMICAL', 0), hitman, exposedCriminal, true)).toBe(3);
  });

  it('Pocket Knife counts perks + weapons (including itself)', () => {
    const knife = wpn('k', 'Pocket Knife', 'MELEE', 0);
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [knife, perk('x', 'Radio'), perk('y', 'Bank')] });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(knife, self, foe, true)).toBe(3); // 3 items
  });

  it('Robot Soldier caps at +5 and Cannon caps at +4', () => {
    const bigHand = Array.from({ length: 8 }, (_, i) => junk(`h${i}`));
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), hand: bigHand });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), hand: bigHand });
    expect(weaponPower(wpn('r', 'Robot Soldier', 'TECH', 0), self, foe, true)).toBe(5);
    expect(weaponPower(wpn('c', 'Cannon', 'RANGED', 0), self, foe, true)).toBe(4);
  });

  it('Catapult is +3 within neighbor range, +2 for a non-neighbor', () => {
    const self = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    expect(weaponPower(wpn('c', 'Catapult', 'RANGED', 2), self, foe, true)).toBe(3);
    expect(weaponPower(wpn('c', 'Catapult', 'RANGED', 2), self, foe, false)).toBe(2);
  });

  it('Laboratory/Ironworks buff the matching weapon classes', () => {
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const lab = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('l', 'Laboratory')] });
    expect(weaponPower(wpn('t', 'Toxic Gas', 'CHEMICAL', 2), lab, foe, true)).toBe(3); // +1 chemical
    const iron = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('i', 'Ironworks')] });
    expect(weaponPower(wpn('bt', 'Bat', 'MELEE', 2), iron, foe, true)).toBe(3); // +1 melee
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
    expect(computeBasePower(hitman, mayor, { ...ATK, allPlayers: [hitman, mayor] })).toBe(8);
    // Mayor: 2 + Harpoon (2 +2 vs melee) + Parasites (= Hitman base 3) = 9.
    expect(computeBasePower(mayor, hitman, { ...DEF, allPlayers: [hitman, mayor] })).toBe(9);
  });

  it('applies the Bodyguard token only on defence', () => {
    const foe = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const guarded = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true });
    const all = [foe, guarded];
    expect(computeBasePower(guarded, foe, { ...DEF, allPlayers: all })).toBe(4); // 2 + 2 token
    expect(computeBasePower(guarded, foe, { ...ATK, allPlayers: all })).toBe(2); // no bonus on attack
  });

  it('suspends the Bodyguard token bonus while the Bodyguard themselves is injured', () => {
    const foe = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const guarded = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true });
    const bodyguard = mkPlayer({ id: 'c', role: role('bodyguard', 'CIVILIAN', 3) });
    const healthy = [foe, guarded, bodyguard];
    expect(computeBasePower(guarded, foe, { ...DEF, allPlayers: healthy })).toBe(4); // 2 + 2 token

    const injuredBodyguard = { ...bodyguard, isInjured: true };
    const withInjuredBodyguard = [foe, guarded, injuredBodyguard];
    // Token stays with `guarded`, but the bonus lapses until the Bodyguard heals.
    expect(computeBasePower(guarded, foe, { ...DEF, allPlayers: withInjuredBodyguard })).toBe(2);
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

  it('Robot Soldier counts the card Hammer draws — pre-combat effects resolve before base power', () => {
    // A plain role (not Hitman/Bodyguard) so nothing but PL + the two
    // weapons contributes to base power.
    const self = mkPlayer({
      id: 'a', role: role('robber', 'CRIMINAL', 3), hand: [junk('h1')],
      inventory: [wpn('ham', 'Hammer', 'MELEE', 2), wpn('rs', 'Robot Soldier', 'TECH', 0)],
    });
    const foe = mkPlayer({ id: 'b', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([self, foe], { currentPlayerIndex: 0, drawPile: [junk('d1')] });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'b' });
    const attacker = next.players.find((p) => p.id === 'a')!;
    expect(attacker.hand).toHaveLength(2); // Hammer's draw landed before Robot Soldier was measured
    expect(next.gameLog).toContain("Robot Soldier scales with a's hand size (+2 PL).");
    // 3 (role PL) + 2 (Hammer) + 2 (Robot Soldier, post-draw) = 7 — would be 6 if base
    // power were computed before Hammer's draw resolved.
    expect(next.combat?.attacker.basePower).toBe(7);
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

  it('stacks Mafia Alliance on top of Mirror — Mirror is itself a Power card the holder played', () => {
    // Mafia Alliance reads "All Power cards you play are worth +1 power," with
    // no carve-out for Mirror, so playing Mirror while holding it gets both:
    // the copied base PL, plus the holder's own +1 (not the original card's).
    const mafioso = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('ma', 'Mafia Alliance')] });
    const played = [{ cardId: 's1', name: 'Surge', byPlayerId: 'z', side: 'DEFENDER' as const, power: 2, basePower: 2 }];
    expect(powerCardValue(pow('mir', 'Mirror', 0), mafioso, played)).toEqual({ basePower: 2, power: 3, copiedCardName: 'Surge' });
  });

  it("Retreat costs -1 PL, netting 0 with Mafia Alliance's own +1", () => {
    const plain = mkPlayer({ id: 'a', role: role('mayor', 'CIVILIAN', 2) });
    expect(powerCardValue(pow('rt', 'Retreat', -1), plain, [])).toEqual({ basePower: -1, power: -1 });

    const mafioso = mkPlayer({ id: 'b', role: role('hitman', 'CRIMINAL', 3), inventory: [perk('ma', 'Mafia Alliance')] });
    expect(powerCardValue(pow('rt', 'Retreat', -1), mafioso, [])).toEqual({ basePower: -1, power: 0 });
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

  it('lets the active Bodyguard play any Power card for their protected teammate while defending', () => {
    const protectedCombatant = { ...combatant, hasBodyguardToken: true };
    expect(powerCardEligible(pow('b', 'Boost', 1), bodyguard, protectedCombatant, 'DEFENDER', []).enabled).toBe(true);
    // Not protecting anyone right now — the token matters, not just the role.
    expect(powerCardEligible(pow('b', 'Boost', 1), bodyguard, combatant, 'DEFENDER', []).enabled).toBe(false);
  });

  it('refuses the Bodyguard from playing Power cards for their protected teammate while attacking — Protection is defense-only', () => {
    const protectedCombatant = { ...combatant, hasBodyguardToken: true };
    expect(powerCardEligible(pow('b', 'Boost', 1), bodyguard, protectedCombatant, 'ATTACKER', []).enabled).toBe(false);
  });

  it('refuses an injured Bodyguard from playing Power cards for their protected teammate', () => {
    const protectedCombatant = { ...combatant, hasBodyguardToken: true };
    const injuredBodyguard = { ...bodyguard, isInjured: true };
    expect(powerCardEligible(pow('b', 'Boost', 1), injuredBodyguard, protectedCombatant, 'DEFENDER', []).enabled).toBe(false);
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

  it("a Signal Jammer stops the jammed defender personally, but not their active Bodyguard", () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('sj', 'Signal Jammer', 'TECH', 2)] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true, hand: [pow('b1', 'Boost', 1)] });
    const guard = mkPlayer({ id: 'grd', role: role('bodyguard', 'CIVILIAN', 3), hand: [pow('b2', 'Boost', 1)] });
    const s = stateWith([atk, def, guard], { currentPlayerIndex: 0 });
    const fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    expect(fight.combat!.defender.canPlayPower).toBe(false);

    const selfPlay = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b1', side: 'DEFENDER', byPlayerId: 'def' });
    expect(selfPlay.combat!.defender.powerCardBonus).toBe(0); // jammed — the defender can't play for themselves

    const guardPlay = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b2', side: 'DEFENDER', byPlayerId: 'grd' });
    expect(guardPlay.combat!.defender.powerCardBonus).toBe(1); // the Bodyguard is unaffected by the jam
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

  it("Mirror copies a card's raw printed value, not the original player's own Mafia Alliance boost", () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('m', 'Mirror', 0)] });
    const def = mkPlayer({
      id: 'def', role: role('mayor', 'CIVILIAN', 2), hand: [pow('b', 'Boost', 1)],
      inventory: [perk('ma', 'Mafia Alliance')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });

    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'b', side: 'DEFENDER', byPlayerId: 'def' });
    expect(fight.combat!.defender.powerCardBonus).toBe(2); // Boost's 1 + def's own Mafia Alliance +1
    expect(fight.combat!.played.at(-1)).toMatchObject({ basePower: 1, power: 2 }); // raw base kept separate from the boosted total

    const after = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'm', side: 'ATTACKER', byPlayerId: 'atk', mirrorTargetCardId: 'b' });
    expect(after.combat!.attacker.powerCardBonus).toBe(1); // copies Boost's raw +1, not def's boosted +2
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

  it('Retreat: attacking gets an Action Point back', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('rt', 'Retreat', -1)] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'rt', side: 'ATTACKER', byPlayerId: 'atk' });

    expect(fight.combat!.attacker.powerCardBonus).toBe(-1);
    expect(fight.players.find((p) => p.id === 'atk')!.actionsRemaining).toBe(2); // 1 (post-attack cost) + 1 back
  });

  it('Retreat: defending draws 2 cards instead', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3) });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), hand: [pow('rt', 'Retreat', -1)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0, drawPile: [junk('d1'), junk('d2')] });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'rt', side: 'DEFENDER', byPlayerId: 'def' });

    expect(fight.combat!.defender.powerCardBonus).toBe(-1);
    expect(fight.players.find((p) => p.id === 'def')!.hand).toHaveLength(2); // Retreat played away, 2 new cards drawn
    expect(fight.drawPile).toHaveLength(0);
  });

  it('Retreat nets 0 power with Mafia Alliance, but still keeps its benefit', () => {
    const atk = mkPlayer({
      id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('rt', 'Retreat', -1)],
      inventory: [perk('ma', 'Mafia Alliance')],
    });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'rt', side: 'ATTACKER', byPlayerId: 'atk' });

    expect(fight.combat!.attacker.powerCardBonus).toBe(0); // -1 base + Mafia Alliance's +1
    expect(fight.players.find((p) => p.id === 'atk')!.actionsRemaining).toBe(2); // benefit still applies
  });

  it('Mirror copying Retreat gets the -1 PL but never the Action Point/draw benefit', () => {
    const atk = mkPlayer({ id: 'atk', role: role('hitman', 'CRIMINAL', 3), hand: [pow('m', 'Mirror', 0)] });
    const def = mkPlayer({ id: 'def', role: role('mayor', 'CIVILIAN', 2), hand: [pow('rt', 'Retreat', -1)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });
    let fight = gameReducer(s, { type: 'ATTACK', targetId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'rt', side: 'DEFENDER', byPlayerId: 'def' });
    fight = gameReducer(fight, { type: 'PLAY_POWER', cardId: 'm', side: 'ATTACKER', byPlayerId: 'atk', mirrorTargetCardId: 'rt' });

    expect(fight.combat!.attacker.powerCardBonus).toBe(-1); // copied Retreat's -1 PL
    expect(fight.players.find((p) => p.id === 'atk')!.actionsRemaining).toBe(1); // no Action Point back
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
    expect(next.players[1].virusTokens).toBe(1); // Viruses token, applied unconditionally
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Missile', side: 'ATTACKER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'rp' } });
    expect(next.players[1].inventory.some((c) => c.name === 'Radio')).toBe(false); // Missile destroyed it
    expect(next.combat).toBeNull(); // AFTER queue empties, fight closes
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

  it('Portal SWAP lets the holder pick which of a teammate’s two weapons to take', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), money: 3, inventory: [wpn('por', 'Portal', 'TECH', 0)] });
    const mate = mkPlayer({
      id: 'm', role: role('spy', 'CRIMINAL', 4), inventory: [wpn('axe', 'Axe', 'MELEE', 5), wpn('mos', 'Mosquitos', 'CHEMICAL', 3)],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    // Choosing the second weapon (Mosquitos) specifically, not just "the teammate's weapon".
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'PORTAL', mode: 'SWAP', teammateId: 'm', teammateWeaponId: 'mos' } });
    expect(next.players[0].inventory.some((c) => c.name === 'Mosquitos')).toBe(true);
    expect(next.players[0].inventory.some((c) => c.name === 'Axe')).toBe(false); // left with the teammate
    expect(next.players[2].inventory.map((c) => c.name).sort()).toEqual(['Axe', 'Portal']); // teammate keeps Axe, gains Portal
  });

  it('Mutants copies a weapon’s effect, not its flat printed power', () => {
    // Axe is pure flat power with no other effect — nothing to copy.
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('axe', 'Axe', 'MELEE', 5)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.pending[0].kind).toBe('MUTANTS');
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'axe' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Axe's flat power (0, no effect) = 5.
    expect(next.combat!.attacker.basePower).toBe(5);
  });

  it('Mutants copying Harpoon gets only its conditional +2, never Harpoon’s own flat power', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    // The defender owns both Harpoon (to be copied) and a Melee weapon (Axe),
    // which is what triggers Harpoon's "+2 more if opponent has Melee" clause
    // from the copying holder's perspective (their opponent is the defender).
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('harp', 'Harpoon', 'RANGED', 2), wpn('axe', 'Axe', 'MELEE', 5)],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'harp' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + Harpoon's copied conditional +2 (not its flat +2) = 7.
    expect(next.combat!.attacker.basePower).toBe(7);
  });

  it('Mutants copying Parasites gains nothing — a PL-scaling stat isn’t a copyable effect', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 4), inventory: [wpn('par', 'Parasites', 'CHEMICAL', 0)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'par' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Parasites (0) = 5, not 4 (defender's role PL).
    expect(next.combat!.attacker.basePower).toBe(5);
  });

  it('Mutants copying Signal Jammer still locks its original owner out of Power cards', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('sj', 'Signal Jammer', 'TECH', 2)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'sj' } });
    // The defender's own Signal Jammer already locks the attacker; the copy
    // now also locks the defender (its original owner) out in return.
    expect(next.combat!.attacker.canPlayPower).toBe(false);
    expect(next.combat!.defender.canPlayPower).toBe(false);
    // No flat power from the copy — Signal Jammer has no conditional bonus.
    expect(next.combat!.attacker.basePower).toBe(5); // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon)
  });

  it('Mutants copying Robot Soldier scales with the copying holder’s own hand, capped at +5', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)],
      hand: [junk('1'), junk('2'), junk('3'), junk('4')],
    });
    // The defender's own hand size (1 card) must NOT be what gets copied.
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('rs', 'Robot Soldier', 'TECH', 0)], hand: [junk('x')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'rs' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Robot Soldier (holder's own 4 cards) = 9.
    expect(next.combat!.attacker.basePower).toBe(9);
  });

  it('Mutants copying Robot Soldier still caps its copied power at +5, even with 6+ cards', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)],
      hand: [junk('1'), junk('2'), junk('3'), junk('4'), junk('5'), junk('6')],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('rs', 'Robot Soldier', 'TECH', 0)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'rs' } });
    // 3 + 1 + 1 (Hitman marksman) + Robot Soldier capped at +5 (not +6) = 10.
    expect(next.combat!.attacker.basePower).toBe(10);
  });

  it('Mutants copying Pocket Knife scales with the copying holder’s own perk/weapon count', () => {
    const perk: MarketCard = { id: 'p1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1), perk],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('pk', 'Pocket Knife', 'MELEE', 0)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'pk' } });
    // Holder's own perk/weapon count: Mutants + Radio = 2.
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Pocket Knife (2) = 7.
    expect(next.combat!.attacker.basePower).toBe(7);
  });

  it('Mutants copying Cannon scales with the original owner’s hand — the copying holder’s actual opponent', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)], hand: [junk('x')],
    });
    // The attacker's own hand size (1 card) must NOT be what gets copied.
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('can', 'Cannon', 'RANGED', 0)],
      hand: [junk('1'), junk('2'), junk('3')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'can' } });
    // Cannon scales with "your opponent's" hand — for the copying holder,
    // that opponent is the defender it was copied from: 3 cards.
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1) + copied Cannon (3) = 8.
    expect(next.combat!.attacker.basePower).toBe(8);
  });

  it('Mutants copying Catapult gains its conditional +1 for fighting a neighbor, never its flat base power', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('cat', 'Catapult', 'RANGED', 2)] });
    // Only two seats — attacker and defender are each other's neighbor.
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'cat' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Catapult's neighbor-range +1 = 6.
    expect(next.combat!.attacker.basePower).toBe(6);
  });

  it('Mutants copying Catapult from a non-neighbor gains no power at all — no base, no conditional', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const neighbor1 = mkPlayer({ id: 'n1', role: role('mayor', 'CIVILIAN', 2) });
    // Seated opposite the attacker in a 4-player circle — not a neighbor, reachable via Catapult.
    const farTarget = mkPlayer({ id: 'far', role: role('sheriff', 'CIVILIAN', 3), inventory: [wpn('cat', 'Catapult', 'RANGED', 2)] });
    const neighbor2 = mkPlayer({ id: 'n2', role: role('attorney', 'CIVILIAN', 3) });
    const s = stateWith([atk, neighbor1, farTarget, neighbor2], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'far' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'cat' } });
    // 3 (Hitman) + Mutants own 1 + Hitman marksman (+1 weapon) + copied Catapult (0, non-neighbor) = 5.
    expect(next.combat!.attacker.basePower).toBe(5);
  });

  it('Mutants lets its holder attack a non-neighbor who carries Catapult', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const neighbor1 = mkPlayer({ id: 'n1', role: role('mayor', 'CIVILIAN', 2) });
    // Seated opposite the attacker in a 4-player circle — not a neighbor.
    const farTarget = mkPlayer({ id: 'far', role: role('sheriff', 'CIVILIAN', 3), inventory: [wpn('cat', 'Catapult', 'RANGED', 2)] });
    const neighbor2 = mkPlayer({ id: 'n2', role: role('attorney', 'CIVILIAN', 3) });
    const s = stateWith([atk, neighbor1, farTarget, neighbor2], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'far' });
    expect(next.combat).toBeTruthy();
    expect(next.combat!.defender.playerId).toBe('far');
  });

  it('a Catapult holder gets +1 PL attacking a neighbor, but none reaching past one', () => {
    const withNeighbor = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('cat', 'Catapult', 'RANGED', 2)] });
    const neighborTarget = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s1 = stateWith([withNeighbor, neighborTarget], { currentPlayerIndex: 0 });
    const attackedNeighbor = gameReducer(s1, { type: 'ATTACK', targetId: 'd' });
    // 3 (Hitman) + Catapult (2 base + 1 neighbor-range) + Marksman (+1 weapon) = 7.
    expect(attackedNeighbor.combat!.attacker.basePower).toBe(7);

    const withFar = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('cat', 'Catapult', 'RANGED', 2)] });
    const n1 = mkPlayer({ id: 'n1', role: role('mayor', 'CIVILIAN', 2) });
    const farTarget = mkPlayer({ id: 'far', role: role('sheriff', 'CIVILIAN', 3) });
    const n2 = mkPlayer({ id: 'n2', role: role('attorney', 'CIVILIAN', 3) });
    const s2 = stateWith([withFar, n1, farTarget, n2], { currentPlayerIndex: 0 });
    const attackedFar = gameReducer(s2, { type: 'ATTACK', targetId: 'far' });
    // 3 (Hitman) + Catapult (2 base, no neighbor-range bonus) + Marksman (+1 weapon) = 6.
    expect(attackedFar.combat!.attacker.basePower).toBe(6);
  });

  it('Mutants does not let its holder reach a non-neighbor without Catapult/Machine Gun', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)] });
    const neighbor1 = mkPlayer({ id: 'n1', role: role('mayor', 'CIVILIAN', 2) });
    const farTarget = mkPlayer({ id: 'far', role: role('sheriff', 'CIVILIAN', 3) });
    const neighbor2 = mkPlayer({ id: 'n2', role: role('attorney', 'CIVILIAN', 3) });
    const s = stateWith([atk, neighbor1, farTarget, neighbor2], { currentPlayerIndex: 0 });

    const next = gameReducer(s, { type: 'ATTACK', targetId: 'far' });
    expect(next.combat).toBeFalsy();
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

  it('Drones: the teammate picks their own card back — a two-step exchange, not the holder picking both sides', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('dr', 'Drones', 'TECH', 2)], hand: [junk('mine')] });
    const mate = mkPlayer({ id: 'm', role: role('spy', 'CRIMINAL', 4), hand: [junk('theirs')] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' } });
    // Nothing has moved yet — it's now the teammate's own choice.
    expect(next.combat!.pending[0]).toEqual({ kind: 'DRONES_RETURN', playerId: 'm', holderId: 'a', holderCardId: 'mine', side: 'ATTACKER' });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['mine']);
    expect(next.players[2].hand.map((c) => c.id)).toEqual(['theirs']);

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES_RETURN', cardId: 'theirs' } });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['theirs']);
    expect(next.players[2].hand.map((c) => c.id)).toEqual(['mine']);
    expect(next.combat!.phase).toBe('POWER'); // PRE queue drained
    // A single combined log line — never two directional ones.
    expect(next.gameLog.filter((l) => l.includes('Drones'))).toEqual(['a exchanges a card with m via Drones.']);
  });

  it('Drones works when the defender holds it, not just the attacker', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3) });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('dr', 'Drones', 'TECH', 2)], hand: [junk('mine')] });
    const mate = mkPlayer({ id: 'm', role: role('attorney', 'CIVILIAN', 3), hand: [junk('theirs')] });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.pending[0]).toMatchObject({ kind: 'DRONES', side: 'DEFENDER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' } });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES_RETURN', cardId: 'theirs' } });
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['theirs']); // defender received the teammate's card
    expect(next.players[2].hand.map((c) => c.id)).toEqual(['mine']);
    expect(next.combat!.phase).toBe('POWER');
  });

  it('DRONES_RETURN inserts ahead of the remaining PRE queue rather than replacing it', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('dr', 'Drones', 'TECH', 2)], hand: [junk('mine')] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [wpn('por', 'Portal', 'TECH', 0)] });
    const mate = mkPlayer({ id: 'm', role: role('spy', 'CRIMINAL', 4), hand: [junk('theirs')] });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0, drawPile: [junk('x'), junk('y')] });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    expect(next.combat!.pending.map((c) => c.kind)).toEqual(['DRONES', 'PORTAL']);

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' } });
    expect(next.combat!.pending.map((c) => c.kind)).toEqual(['DRONES_RETURN', 'PORTAL']);

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES_RETURN', cardId: 'theirs' } });
    expect(next.combat!.pending.map((c) => c.kind)).toEqual(['PORTAL']);
    expect(next.combat!.phase).toBe('PRE'); // Portal still unresolved

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'PORTAL', mode: 'DRAW' } });
    expect(next.combat!.phase).toBe('POWER');
  });

  it('Drones refuses an exchange with a teammate who has no cards to give', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('dr', 'Drones', 'TECH', 2)], hand: [junk('mine')] });
    const mate = mkPlayer({ id: 'm', role: role('spy', 'CRIMINAL', 4), hand: [] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def, mate], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DRONES', mode: 'EXCHANGE', cardId: 'mine', teammateId: 'm' } });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['mine']); // untouched — wasted, not queued
    expect(next.combat!.phase).toBe('POWER'); // PRE resolved with nothing pending
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

describe('interactive combat — Missile/Molotov destroy-perk (AFTER phase)', () => {
  it('lets the winner choose which of the loser’s perks to destroy', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mis', 'Missile', 'TECH', 2)] });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [perk('r1', 'Radio'), perk('c1', 'Computer')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Missile', side: 'ATTACKER' });

    // The winner picks Computer, not Radio — a real choice, not "first perk".
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'c1' } });
    expect(next.players[1].inventory.map((c) => c.id)).toEqual(['r1']);
    expect(next.combat).toBeNull();
  });

  it('a defender who repels the attack still triggers their own Missile — roles reversed', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 1), inventory: [perk('r1', 'Radio')] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 3), inventory: [wpn('mis', 'Missile', 'TECH', 2)] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    // Attacker base 1 vs defender base 3 + 2 (Missile) = 5 → the defender repels it.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'd', targetId: 'a', weaponName: 'Missile', side: 'DEFENDER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    expect(next.players[0].inventory).toHaveLength(0); // the attacker's Radio, destroyed
    expect(next.players[0].isInjured).toBe(false); // repelling doesn't injure the attacker
    expect(next.combat).toBeNull();
  });

  it('is skipped entirely — no pending choice at all — when the loser has no perks', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mis', 'Missile', 'TECH', 2)] });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2) });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat).toBeNull(); // no perks to destroy — closes immediately
    expect(next.players[1].isInjured).toBe(true);
  });

  it('Molotov Cocktail refunds a destroyed perk’s cost to a Civilian victim', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mol', 'Molotov Cocktail', 'RANGED', 2)] });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2), money: 1, inventory: [perk('r1', 'Radio', { cost: 2 })],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    expect(next.players[1].inventory).toHaveLength(0);
    expect(next.players[1].money).toBe(3); // 1 + Radio's $2 cost refunded
  });

  it('an attacker still triggers their Molotov even when they lose the combat — no "if you win" clause', () => {
    const atk = mkPlayer({
      id: 'a', role: role('boss', 'CRIMINAL', 1), inventory: [wpn('mol', 'Molotov Cocktail', 'RANGED', 2)],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 5), inventory: [perk('r1', 'Radio')] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    // Attacker base 1 + 2 (Molotov) = 3 vs defender base 5 → the attack fails.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Molotov Cocktail', side: 'ATTACKER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    expect(next.players[1].inventory).toHaveLength(0); // the defender's Radio, destroyed despite the attacker losing
    expect(next.combat).toBeNull();
  });

  it('a defender still triggers their Molotov even when they lose the combat (get injured)', () => {
    const atk = mkPlayer({ id: 'a', role: role('hitman', 'CRIMINAL', 5) });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 1), inventory: [wpn('mol', 'Molotov Cocktail', 'RANGED', 2)],
    });
    const atkWithPerk = { ...atk, inventory: [perk('r1', 'Radio')] };
    const s = stateWith([atkWithPerk, def], { currentPlayerIndex: 0 });

    // Attacker base 5 vs defender base 1 + 2 (Molotov) = 3 → the attack succeeds.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'd', targetId: 'a', weaponName: 'Molotov Cocktail', side: 'DEFENDER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    expect(next.players[0].inventory).toHaveLength(0); // the attacker's Radio, destroyed
    expect(next.players[1].isInjured).toBe(true); // the defender still lost the fight
    expect(next.combat).toBeNull();
  });

  it('Mutants copying an opponent’s Missile also queues a destroy-perk choice', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3), inventory: [wpn('mut', 'Mutants', 'CHEMICAL', 1)],
    });
    const def = mkPlayer({
      id: 'd', role: role('mayor', 'CIVILIAN', 2),
      inventory: [wpn('mis', 'Missile', 'TECH', 2), perk('r1', 'Radio')],
    });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'MUTANTS', mode: 'COPY', opponentWeaponId: 'mis' } });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending[0]).toEqual({ kind: 'DESTROY_PERK', playerId: 'a', targetId: 'd', weaponName: 'Missile', side: 'ATTACKER' });

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    expect(next.players[1].inventory.some((c) => c.name === 'Radio')).toBe(false);
    expect(next.players[1].inventory.some((c) => c.name === 'Missile')).toBe(true); // the weapon itself is untouched
    expect(next.combat).toBeNull();
  });

  it('auto-skips a second destroy-perk choice once the first already took the loser’s only perk', () => {
    const atk = mkPlayer({
      id: 'a', role: role('hitman', 'CRIMINAL', 3),
      inventory: [wpn('mis', 'Missile', 'TECH', 2), wpn('mol', 'Molotov Cocktail', 'RANGED', 2)],
    });
    const def = mkPlayer({ id: 'd', role: role('mayor', 'CIVILIAN', 2), inventory: [perk('r1', 'Radio')] });
    const s = stateWith([atk, def], { currentPlayerIndex: 0 });

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'd' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat!.pending).toHaveLength(2); // one per weapon

    next = gameReducer(next, { type: 'COMBAT_CHOICE', input: { kind: 'DESTROY_PERK', perkId: 'r1' } });
    // The second (Molotov's) choice had nothing left to destroy — auto-skipped.
    expect(next.players[1].inventory).toHaveLength(0);
    expect(next.combat).toBeNull();
  });
});
