/**
 * src/engine/combat.ts
 *
 * All combat math and effects for Criminal Rush. Pure and UI-agnostic: it reads
 * the card data already carried on each Player (names, weaponType, power) and
 * never imports `constants`. See docs/criminal-rush-notes.md pp.8-10.
 *
 * Combat is a multi-phase, interactive fight:
 *   1. initiate    — validate, spend actions, resolve pre-combat weapon effects
 *   2. base power  — role PL + weapons (+ conditionals/perks) + Hitman/Bodyguard
 *   3. power phase  — both sides play/pass Power cards (driven by the reducer)
 *   4. resolve     — higher total wins (defender wins ties); apply outcomes
 */

import type {
  GameState, Player, CombatSide, CombatState, PlayedPowerCard, CombatChoice, CombatChoiceInput,
} from '../types/game.js';
import type { ActionCard, MarketCard, WeaponType } from '../types/cards.js';
import { applyScore, log, neighborIds, playerIndexById, updatePlayer } from './rules.js';
import { shuffle, type Rng } from './deck.js';

// --- Small inventory helpers -------------------------------------------------

/** A player's equipped weapons (max 2 count in combat, rulebook p.8). */
export function weaponsOf(player: Player): MarketCard[] {
  return player.inventory.filter((c) => c.type === 'WEAPON').slice(0, 2);
}

/** Whether the player has any weapon of the given damage class. */
export function hasWeaponType(player: Player, type: WeaponType): boolean {
  return player.inventory.some((c) => c.type === 'WEAPON' && c.weaponType === type);
}

/** Whether the player holds a named perk/weapon. */
export function hasItem(player: Player, name: string): boolean {
  return player.inventory.some((c) => c.name === name);
}

function perksAndWeaponsCount(player: Player): number {
  return player.inventory.filter((c) => c.type === 'PERK' || c.type === 'WEAPON').length;
}

// --- Base power --------------------------------------------------------------

/**
 * A single weapon's power contribution, resolving name-specific conditionals,
 * PL-scaling overrides, and the Laboratory/Ironworks perk buffs.
 */
export function weaponPower(
  weapon: MarketCard,
  self: Player,
  opponent: Player,
  playerCount: number,
): number {
  let power: number;

  switch (weapon.name) {
    // PL-scaling / override weapons ignore the printed `power`.
    case 'Parasites':
      power = opponent.role.powerlevel;
      break;
    case 'Pocket Knife':
      power = perksAndWeaponsCount(self); // +1 per perk & weapon, including itself
      break;
    case 'Robot Soldier':
      power = Math.min(self.hand.length, 5);
      break;
    case 'Cannon':
      power = Math.min(opponent.hand.length, 4);
      break;
    case 'Catapult':
      power = playerCount === 4 ? 3 : 2;
      break;
    default: {
      power = weapon.power ?? 0;
      // "+2 more if opponent has an X weapon" conditionals.
      if (weapon.name === 'Switch Blade' && hasWeaponType(opponent, 'CHEMICAL')) power += 2;
      if (weapon.name === 'Harpoon' && hasWeaponType(opponent, 'MELEE')) power += 2;
      if (weapon.name === 'Magnetic Deflector' && hasWeaponType(opponent, 'RANGED')) power += 2;
      if (weapon.name === 'Corrosion Cannisters' && hasWeaponType(opponent, 'TECH')) power += 2;
    }
  }

  // Perk weapon buffs (Black Market): +1 to your weapons of the matching class.
  const t = weapon.weaponType;
  if ((t === 'TECH' || t === 'CHEMICAL') && hasItem(self, 'Laboratory')) power += 1;
  if ((t === 'MELEE' || t === 'RANGED') && hasItem(self, 'Ironworks')) power += 1;

  return power;
}

/**
 * The power Mutants gains from copying a weapon — its *effect*, never the
 * weapon's own flat printed power. Three different kinds of "effect":
 *  - Resource-scaling weapons (Pocket Knife/Robot Soldier/Cannon) count as an
 *    effect and copy in full, caps included (Robot Soldier's max +5) — using
 *    the same "you"/"your opponent" mapping the printed text always has,
 *    just re-pointed at the new holder: Pocket Knife/Robot Soldier scale with
 *    the *copying holder's own* stat ("cards/perks YOU hold"), while Cannon
 *    scales with "your opponent['s]" — the holder's actual opponent, `opp`.
 *  - A flat "+2 more if opponent has an X weapon" conditional (Harpoon,
 *    Switch Blade, Magnetic Deflector, Corrosion Cannisters) copies as just
 *    that +2, evaluated against `opp` — the copying holder's own actual
 *    opponent — never the weapon's own base power.
 *  - Parasites (a role-identity stat, not a countable resource) and Catapult
 *    (flat power set by table size, not a per-object count) copy 0 power;
 *    Catapult's real copyable effect is its non-neighbor targeting, handled
 *    separately by canReachNonNeighbors.
 */
function weaponCopyPower(weapon: MarketCard, holder: Player, opp: Player, playerCount: number): number {
  switch (weapon.name) {
    case 'Parasites':
    case 'Catapult':
      return 0;
    case 'Pocket Knife':
    case 'Robot Soldier':
    case 'Cannon':
      return weaponPower(weapon, holder, opp, playerCount);
    default: {
      let bonus = 0;
      if (weapon.name === 'Switch Blade' && hasWeaponType(opp, 'CHEMICAL')) bonus += 2;
      if (weapon.name === 'Harpoon' && hasWeaponType(opp, 'MELEE')) bonus += 2;
      if (weapon.name === 'Magnetic Deflector' && hasWeaponType(opp, 'RANGED')) bonus += 2;
      if (weapon.name === 'Corrosion Cannisters' && hasWeaponType(opp, 'TECH')) bonus += 2;
      return bonus;
    }
  }
}

/**
 * A case-log line for a weapon's conditional or computed power this combat
 * (Harpoon's +2 vs Melee, Parasites matching a role's PL, a Laboratory buff,
 * …) — undefined when the weapon just contributes its flat printed value with
 * nothing situational to explain. Mirrors weaponPower's own conditionals;
 * kept separate so weaponPower itself stays a plain number for its other
 * callers (computeBasePower, Mutants' copy) and their tests.
 */
function weaponPowerNote(weapon: MarketCard, self: Player, opponent: Player, playerCount: number): string | undefined {
  switch (weapon.name) {
    case 'Parasites':
      return `${weapon.name} matches ${opponent.name}'s Base PL (${opponent.role.powerlevel}).`;
    case 'Pocket Knife':
      return `${weapon.name} scales with ${self.name}'s perks/weapons (+${perksAndWeaponsCount(self)} PL).`;
    case 'Robot Soldier':
      return `${weapon.name} scales with ${self.name}'s hand size (+${Math.min(self.hand.length, 5)} PL).`;
    case 'Cannon':
      return `${weapon.name} scales with ${opponent.name}'s hand size (+${Math.min(opponent.hand.length, 4)} PL).`;
    case 'Catapult':
      return `${weapon.name} grants +${playerCount === 4 ? 3 : 2} PL in a ${playerCount}-player game.`;
    default: {
      const bonuses: string[] = [];
      if (weapon.name === 'Switch Blade' && hasWeaponType(opponent, 'CHEMICAL')) bonuses.push('+2 PL against a Chemical weapon');
      if (weapon.name === 'Harpoon' && hasWeaponType(opponent, 'MELEE')) bonuses.push('+2 PL against a Melee weapon');
      if (weapon.name === 'Magnetic Deflector' && hasWeaponType(opponent, 'RANGED')) bonuses.push('+2 PL against a Ranged weapon');
      if (weapon.name === 'Corrosion Cannisters' && hasWeaponType(opponent, 'TECH')) bonuses.push('+2 PL against a Tech weapon');
      const t = weapon.weaponType;
      if ((t === 'TECH' || t === 'CHEMICAL') && hasItem(self, 'Laboratory')) bonuses.push('+1 PL from Laboratory');
      if ((t === 'MELEE' || t === 'RANGED') && hasItem(self, 'Ironworks')) bonuses.push('+1 PL from Ironworks');
      return bonuses.length > 0 ? `${weapon.name} gets ${bonuses.join(' and ')}.` : undefined;
    }
  }
}

/**
 * Whether the +2 PL Bodyguard token still pays out for `self`. It doesn't
 * while the Bodyguard themselves is injured — the token is flipped and the
 * bonus lapses until they heal (rulebook p.15 clarifications), even though
 * the protected teammate keeps holding the token.
 */
function bodyguardBonusActive(self: Player, allPlayers: Player[]): boolean {
  if (!self.hasBodyguardToken) return false;
  const bodyguard = allPlayers.find((p) => p.role.id === 'bodyguard' && p.team === self.team);
  return !bodyguard || !bodyguard.isInjured;
}

/**
 * A combatant's base power before any Power cards: current PL (role base minus
 * expose, plus permanent gains already folded into powerLevel) + weapons +
 * Hitman's attack bonus + Bodyguard's defensive bonus.
 */
export function computeBasePower(
  self: Player,
  opponent: Player,
  opts: { isAttacker: boolean; playerCount: number; allPlayers: Player[] },
): number {
  const weapons = weaponsOf(self);
  const weaponSum = weapons.reduce((sum, w) => sum + weaponPower(w, self, opponent, opts.playerCount), 0);
  const hitmanBonus = opts.isAttacker && self.role.id === 'hitman' ? weapons.length : 0;
  const bodyguardBonus = !opts.isAttacker && bodyguardBonusActive(self, opts.allPlayers) ? 2 : 0;
  return self.powerLevel + weaponSum + hitmanBonus + bodyguardBonus;
}

// --- Targeting & cost --------------------------------------------------------

/**
 * Weapons that let the holder attack beyond their two neighbors — including,
 * for a Mutants holder, a non-neighbor `target` who themselves carries
 * Catapult/Machine Gun: Mutants can only copy a weapon from this fight's
 * actual opponent, so reaching them in the first place has to be legal on
 * the strength of the copy they intend to make.
 */
function canReachNonNeighbors(player: Player, target: Player): boolean {
  if (hasItem(player, 'Catapult') || hasItem(player, 'Machine Gun')) return true;
  return hasItem(player, 'Mutants') && (hasItem(target, 'Catapult') || hasItem(target, 'Machine Gun'));
}

/**
 * Validate an attack. Returns an error message, or null if the attack is legal.
 * Civilians may only strike exposed, uncaptured Criminals; Criminals may only
 * strike Civilians who are not already injured.
 */
export function attackError(state: GameState, attackerIndex: number, target: Player): string | null {
  const attacker = state.players[attackerIndex];
  if (!attacker) return 'No such attacker.';
  if (attacker.id === target.id) return 'You cannot attack yourself.';
  if (attacker.isInjured || attacker.isCaptured) return 'You cannot attack in your current state.';

  if (!neighborIds(state, attackerIndex).includes(target.id) && !canReachNonNeighbors(attacker, target)) {
    return 'You may only attack a neighbor.';
  }

  if (attacker.team === 'CIVILIAN') {
    if (target.team !== 'CRIMINAL' || !target.isExposed || target.isCaptured) {
      return 'Civilians may only attack an exposed Criminal.';
    }
  } else if (target.team !== 'CIVILIAN' || target.isInjured) {
    return 'Criminals may only attack a Civilian who is not already injured.';
  }
  return null;
}

/** Actions the attacker must spend: 2, −1 with Getaway Car, +1 vs Nerve Agents (min 1). */
export function attackActionCost(attacker: Player, defender: Player): number {
  let cost = 2;
  if (hasItem(attacker, 'Getaway Car')) cost -= 1;
  if (hasItem(defender, 'Nerve Agents')) cost += 1;
  return Math.max(1, cost);
}

// --- Deck helpers used by pre-combat effects ---------------------------------

/** Draw the top card into a player's hand (reshuffles discard silently if empty). */
function drawForPlayer(state: GameState, playerId: string): GameState {
  let s = state;
  if (s.drawPile.length === 0) {
    if (s.discardPile.length === 0) return s;
    s = log({ ...s, drawPile: s.discardPile, discardPile: [] }, 'The deck was reshuffled during combat.');
  }
  const [top, ...rest] = s.drawPile;
  if (!top) return s;
  const idx = playerIndexById(s, playerId);
  s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, top] }));
  return { ...s, drawPile: rest };
}

/** Discard a player's first hand card (deterministic stand-in for "random"). */
function discardFirstCard(state: GameState, playerId: string, why: string): GameState {
  const idx = playerIndexById(state, playerId);
  const player = state.players[idx];
  if (!player || player.hand.length === 0) return state;
  const [card, ...rest] = player.hand;
  const s = updatePlayer(state, idx, (p) => ({ ...p, hand: rest }));
  return log({ ...s, discardPile: [...s.discardPile, card] }, `${player.name} discards ${card.name} (${why}).`);
}

// --- Pre-combat weapon effects ----------------------------------------------

/**
 * One weapon's deterministic before-combat effect, `self` (the holder)
 * against `opp`. Portal (draw/swap), Drones (exchange), Mutants (copy), and
 * Pistol (choose which card to discard) are interactive choices resolved in
 * the PRE phase instead — see buildPendingChoices / applyCombatChoice — so
 * they're a no-op here. Shared by preCombatFor (a player's own weapons) and
 * applyMutants (a copied weapon's effect fires too, not just its power —
 * against this fight's actual opponent, whoever the weapon was copied from).
 */
function applyPreCombatWeaponEffect(state: GameState, weapon: MarketCard, selfId: string, oppId: string, isAttacker: boolean): GameState {
  const self = state.players[playerIndexById(state, selfId)];
  switch (weapon.name) {
    case 'Hammer': {
      const s = log(state, `${self.name}'s Hammer draws a card before combat.`);
      return drawForPlayer(s, selfId);
    }
    case 'Barbed Wire':
      return discardFirstCard(state, oppId, 'Barbed Wire');
    case 'Mosquitos':
      return discardFirstCard(state, oppId, 'Mosquitos');
    case 'Brass Knuckles': {
      if (!isAttacker) return state;
      const oppIdx = playerIndexById(state, oppId);
      const opp = state.players[oppIdx];
      if (!opp || opp.money <= 0) return state;
      let s = updatePlayer(state, oppIdx, (p) => ({ ...p, money: p.money - 1 }));
      s = updatePlayer(s, playerIndexById(s, selfId), (p) => ({ ...p, money: p.money + 1 }));
      return log(s, `${self.name}'s Brass Knuckles steal $1 from ${opp.name}.`);
    }
    default:
      return state;
  }
}

/** Apply one player's before-combat weapon effects against their opponent. */
function preCombatFor(state: GameState, selfId: string, oppId: string, isAttacker: boolean): GameState {
  const self = state.players[playerIndexById(state, selfId)];
  let s = state;
  for (const weapon of weaponsOf(self)) {
    s = applyPreCombatWeaponEffect(s, weapon, selfId, oppId, isAttacker);
  }
  return s;
}

/** Resolve every before-combat weapon effect: attacker first, then defender. */
export function resolvePreCombat(state: GameState, attackerId: string, defenderId: string): GameState {
  let s = preCombatFor(state, attackerId, defenderId, true);
  s = preCombatFor(s, defenderId, attackerId, false);
  return s;
}

// --- Interactive pre-combat choices (Portal / Drones / Mutants / Pistol) ----

/** Weapons that require an interactive pre-combat decision. */
const CHOICE_WEAPONS: Record<string, CombatChoice['kind']> = {
  Portal: 'PORTAL',
  Drones: 'DRONES',
  Mutants: 'MUTANTS',
  Pistol: 'PISTOL',
};

/**
 * Build the queue of interactive pre-combat choices — attacker's weapons first,
 * then the defender's. The Power phase begins once all are resolved. Pistol is
 * only queued when the holder actually has a card to discard ("if possible" —
 * an empty hand means there's no choice to make).
 */
export function buildPendingChoices(state: GameState, attackerId: string, defenderId: string): CombatChoice[] {
  const choices: CombatChoice[] = [];
  const add = (playerId: string, side: CombatSide) => {
    const player = state.players[playerIndexById(state, playerId)];
    if (!player) return;
    for (const w of weaponsOf(player)) {
      const kind = CHOICE_WEAPONS[w.name];
      if (!kind || kind === 'LEAVING_EVIDENCE') continue;
      if (kind === 'PISTOL' && player.hand.length === 0) continue;
      choices.push({ kind, playerId, weaponId: w.id, side } as CombatChoice);
    }
  };
  add(attackerId, 'ATTACKER');
  add(defenderId, 'DEFENDER');
  return choices;
}

/**
 * Finalize base powers (including any Mutants copies) and Signal-Jammer lockout,
 * then move the fight into the Power phase. Call once all PRE choices resolve.
 */
export function enterPowerPhase(state: GameState): GameState {
  const combat = state.combat;
  if (!combat) return state;
  const atk = state.players[playerIndexById(state, combat.attacker.playerId)];
  const def = state.players[playerIndexById(state, combat.defender.playerId)];
  const pc = combat.playerCount;
  const atkBase = computeBasePower(atk, def, { isAttacker: true, playerCount: pc, allPlayers: state.players }) + (combat.attacker.copiedWeaponPower ?? 0);
  const defBase = computeBasePower(def, atk, { isAttacker: false, playerCount: pc, allPlayers: state.players }) + (combat.defender.copiedWeaponPower ?? 0);

  // Record any conditional/computed weapon bonuses that just applied, so a
  // non-obvious base-power number is explained in the case log.
  let s = state;
  for (const w of weaponsOf(atk)) {
    const note = weaponPowerNote(w, atk, def, pc);
    if (note) s = log(s, note);
  }
  for (const w of weaponsOf(def)) {
    const note = weaponPowerNote(w, def, atk, pc);
    if (note) s = log(s, note);
  }

  return log(
    {
      ...s,
      combat: {
        ...combat,
        phase: 'POWER',
        attacker: {
          ...combat.attacker,
          basePower: atkBase,
          canPlayPower: !hasItem(def, 'Signal Jammer') && combat.defender.copiedWeaponName !== 'Signal Jammer',
        },
        defender: {
          ...combat.defender,
          basePower: defBase,
          canPlayPower: !hasItem(atk, 'Signal Jammer') && combat.attacker.copiedWeaponName !== 'Signal Jammer',
        },
      },
    },
    `Power phase — ${atk.name}: ${atkBase} vs ${def.name}: ${defBase}. Play Power cards or pass.`,
  );
}

function applyPortal(state: GameState, head: Extract<CombatChoice, { kind: 'PORTAL' }>, input: CombatChoiceInput): GameState {
  const hi = playerIndexById(state, head.playerId);
  const holder = state.players[hi];
  if (input.kind === 'PORTAL' && input.mode === 'SWAP' && holder.money >= 1) {
    const ti = playerIndexById(state, input.teammateId);
    const teammate = state.players[ti];
    const portal = holder.inventory.find((c) => c.id === head.weaponId);
    const twpn = teammate?.inventory.find((c) => c.id === input.teammateWeaponId && c.type === 'WEAPON');
    if (teammate && teammate.id !== holder.id && teammate.team === holder.team && portal && twpn) {
      let s = updatePlayer(state, hi, (p) => ({
        ...p, money: p.money - 1, inventory: [...p.inventory.filter((c) => c.id !== portal.id), twpn],
      }));
      s = updatePlayer(s, ti, (p) => ({ ...p, inventory: [...p.inventory.filter((c) => c.id !== twpn.id), portal] }));
      return log(s, `${holder.name} pays $1 to swap Portal for ${teammate.name}'s ${twpn.name}.`);
    }
  }
  // Default / DRAW: draw 2 cards.
  let s = drawForPlayer(state, head.playerId);
  s = drawForPlayer(s, head.playerId);
  return log(s, `${holder.name}'s Portal draws 2 cards.`);
}

/**
 * Drones' first half: the holder picks a teammate and one of their own cards.
 * The teammate's hand is never shown to the holder and no card moves yet —
 * the teammate must separately choose their own card to give back (see
 * applyDronesReturn), queued ahead of any other still-pending PRE choices.
 * Unlike the simple choices below, this may chain a new pending item rather
 * than just popping itself off, so it manages `combat.pending` (via
 * advancePendingQueue) and returns directly.
 */
function applyDrones(state: GameState, head: Extract<CombatChoice, { kind: 'DRONES' }>, input: CombatChoiceInput): GameState {
  const combat = state.combat!;
  const holder = state.players[playerIndexById(state, head.playerId)];
  if (input.kind !== 'DRONES' || input.mode !== 'EXCHANGE') {
    return advancePendingQueue(log(state, `${holder.name} skips the Drones exchange.`));
  }
  const teammate = state.players[playerIndexById(state, input.teammateId)];
  const mine = holder.hand.find((c) => c.id === input.cardId);
  if (!teammate || teammate.id === holder.id || teammate.team !== holder.team || !mine || teammate.hand.length === 0) {
    return advancePendingQueue(log(state, 'Invalid Drones exchange.'));
  }
  const rest = combat.pending.slice(1);
  const returnChoice: CombatChoice = {
    kind: 'DRONES_RETURN', playerId: teammate.id, holderId: holder.id, holderCardId: mine.id, side: head.side,
  };
  return { ...state, combat: { ...combat, pending: [returnChoice, ...rest] } };
}

/** Drones' second half: the teammate's own choice of what to give back, completing the swap with a single combined log line. */
function applyDronesReturn(state: GameState, head: Extract<CombatChoice, { kind: 'DRONES_RETURN' }>, input: CombatChoiceInput): GameState {
  const teammateIdx = playerIndexById(state, head.playerId);
  const teammate = state.players[teammateIdx];
  const holderIdx = playerIndexById(state, head.holderId);
  const holder = state.players[holderIdx];
  const mine = holder.hand.find((c) => c.id === head.holderCardId);
  const theirs = input.kind === 'DRONES_RETURN' ? teammate.hand.find((c) => c.id === input.cardId) : undefined;
  if (!mine || !theirs) {
    return log(state, `${teammate.name} could not complete the Drones exchange.`);
  }
  let s = updatePlayer(state, holderIdx, (p) => ({ ...p, hand: [...p.hand.filter((c) => c.id !== mine.id), theirs] }));
  s = updatePlayer(s, teammateIdx, (p) => ({ ...p, hand: [...p.hand.filter((c) => c.id !== theirs.id), mine] }));
  return log(s, `${holder.name} exchanges a card with ${teammate.name} via Drones.`);
}

/**
 * Mutants: copy the *effect* of one weapon belonging to this fight's actual
 * opponent — never any other player — not its full power level. That means
 * weaponCopyPower's conditional bonus (if any), plus its before-combat effect
 * (Hammer draws, Barbed Wire/Mosquitos force a discard, Brass Knuckles
 * steals) fired against that same opponent. A copied Signal Jammer's "may not
 * play Power cards" lockout is applied separately in enterPowerPhase, keyed
 * off copiedWeaponName below.
 */
function applyMutants(state: GameState, head: Extract<CombatChoice, { kind: 'MUTANTS' }>, input: CombatChoiceInput): GameState {
  const combat = state.combat!;
  const holder = state.players[playerIndexById(state, head.playerId)];
  if (input.kind !== 'MUTANTS' || input.mode !== 'COPY') {
    return log(state, `${holder.name}'s Mutants copy nothing.`);
  }
  const oppId = head.side === 'ATTACKER' ? combat.defender.playerId : combat.attacker.playerId;
  const opp = state.players[playerIndexById(state, oppId)];
  const weapon = opp.inventory.find((c) => c.id === input.opponentWeaponId && c.type === 'WEAPON');
  if (!weapon) return log(state, 'No such opponent weapon to copy.');
  const copied = weaponCopyPower(weapon, holder, opp, combat.playerCount);
  const part = head.side === 'ATTACKER' ? combat.attacker : combat.defender;
  const newPart = { ...part, copiedWeaponPower: (part.copiedWeaponPower ?? 0) + copied, copiedWeaponName: weapon.name };
  const newCombat = head.side === 'ATTACKER' ? { ...combat, attacker: newPart } : { ...combat, defender: newPart };
  const powerNote = copied ? ` (+${copied} power)` : '';
  const s = log({ ...state, combat: newCombat }, `${holder.name}'s Mutants copy ${weapon.name}'s effect${powerNote}.`);
  return applyPreCombatWeaponEffect(s, weapon, holder.id, opp.id, head.side === 'ATTACKER');
}

/** Pistol: the holder chooses which of their own cards to discard before combat. */
function applyPistol(state: GameState, head: Extract<CombatChoice, { kind: 'PISTOL' }>, input: CombatChoiceInput): GameState {
  const hi = playerIndexById(state, head.playerId);
  const holder = state.players[hi];
  const card = input.kind === 'PISTOL' ? holder.hand.find((c) => c.id === input.cardId) : undefined;
  if (!card) return log(state, `${holder.name} must choose a card from hand to discard for Pistol.`);
  const s = updatePlayer(state, hi, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== card.id) }));
  return log({ ...s, discardPile: [...s.discardPile, card] }, `${holder.name} discards ${card.name} (Pistol).`);
}

/**
 * Nurse's Triage: heal (HEAL) discards the chosen card and prevents the
 * injury outright; declining or skipping (SKIP, or an invalid/missing card)
 * falls through to the normal injury — and, from there, Leaving Evidence.
 * Unlike the other PRE/AFTER choices this doesn't just pop off the queue: it
 * may replace it with a fresh LEAVING_EVIDENCE pending item, so the caller
 * returns its result directly rather than running the generic pop-tail.
 */
function applyNurseHeal(state: GameState, head: Extract<CombatChoice, { kind: 'NURSE_HEAL' }>, input: CombatChoiceInput): GameState {
  const combat = state.combat!;
  const nurseIdx = playerIndexById(state, head.playerId);
  const nurse = state.players[nurseIdx];
  const defender = state.players[playerIndexById(state, head.injuredId)];

  if (input.kind === 'NURSE_HEAL' && input.mode === 'HEAL') {
    const card = nurse.hand.find((c) => c.id === input.cardId);
    if (card) {
      let s = updatePlayer(state, nurseIdx, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== card.id) }));
      s = { ...s, discardPile: [...s.discardPile, card] };
      s = log(s, `${nurse.name} discards ${card.name} — Triage keeps ${defender.name} from being injured.`);
      return { ...s, combat: null };
    }
  }
  const skipped = log(state, `${nurse.name} does not use Triage — ${defender.name} is injured.`);
  return injureAndMaybeLeaveEvidence(skipped, combat, defender);
}

function applyLeavingEvidence(
  state: GameState,
  head: Extract<CombatChoice, { kind: 'LEAVING_EVIDENCE' }>,
  input: CombatChoiceInput,
  rng: Rng,
): GameState {
  const player = state.players[playerIndexById(state, head.playerId)];
  const ids = input.kind === 'LEAVING_EVIDENCE' ? input.evidenceIds.slice(0, 2) : [];
  const taken = state.discardPile.filter((c) => ids.includes(c.id) && c.type === 'EVIDENCE');
  if (taken.length === 0) return log(state, `${player.name} leaves the evidence behind.`);
  const takenIds = new Set(taken.map((c) => c.id));
  const s = {
    ...state,
    discardPile: state.discardPile.filter((c) => !takenIds.has(c.id)),
    drawPile: shuffle([...taken, ...state.drawPile], rng), // genuinely shuffled in, not stacked on top
  };
  return log(s, `${player.name} shuffles ${taken.length} Evidence card(s) back into the deck (Leaving Evidence).`);
}

/**
 * Pop the resolved head off `combat.pending` and advance the phase once it's
 * empty: PRE moves into the Power phase, AFTER closes the fight. Shared by
 * the generic tail below and by choices (DRONES, NURSE_HEAL) that resolve
 * outside it because they may chain a fresh pending item instead.
 */
function advancePendingQueue(state: GameState): GameState {
  const combat = state.combat;
  if (!combat) return state;
  let rest = combat.pending.slice(1);
  // A queued Missile/Molotov destroy-choice can go dead mid-queue — an
  // earlier one in the same combat already destroyed the target's last perk
  // (e.g. the winner holds both weapons, or holds one and copied the other
  // via Mutants). Auto-skip it rather than showing an empty picker.
  let head = rest[0];
  while (head !== undefined && head.kind === 'DESTROY_PERK') {
    const targetId = head.targetId;
    const target = state.players.find((p) => p.id === targetId);
    if (target?.inventory.some((c) => c.type === 'PERK')) break;
    rest = rest.slice(1);
    head = rest[0];
  }
  let s: GameState = { ...state, combat: { ...combat, pending: rest } };
  if (rest.length === 0) {
    if (combat.phase === 'PRE') s = enterPowerPhase(s);
    else if (combat.phase === 'AFTER') s = { ...s, combat: null };
  }
  return s;
}

/**
 * Resolve the head pending choice with the player's `input`, pop it, and advance
 * the phase: when the PRE queue empties the Power phase begins; when the AFTER
 * queue empties the fight closes.
 */
export function applyCombatChoice(state: GameState, input: CombatChoiceInput, rng: Rng = Math.random): GameState {
  const combat = state.combat;
  if (!combat || combat.pending.length === 0) return log(state, 'No pending combat choice.');
  const head = combat.pending[0];
  if (head.kind !== input.kind) return log(state, `Expected a ${head.kind} choice.`);

  // NURSE_HEAL and DRONES each manage their own resulting `combat` (they may
  // chain a fresh pending item — Leaving Evidence, or the teammate's own
  // return card — instead of just popping the queue), so they return
  // directly rather than falling into the generic pop-tail below.
  if (head.kind === 'NURSE_HEAL') return applyNurseHeal(state, head, input);
  if (head.kind === 'DRONES') return applyDrones(state, head, input);

  let s = state;
  switch (head.kind) {
    case 'PORTAL': s = applyPortal(s, head, input); break;
    case 'DRONES_RETURN': s = applyDronesReturn(s, head, input); break;
    case 'MUTANTS': s = applyMutants(s, head, input); break;
    case 'PISTOL': s = applyPistol(s, head, input); break;
    case 'LEAVING_EVIDENCE': s = applyLeavingEvidence(s, head, input, rng); break;
    case 'DESTROY_PERK': s = applyDestroyPerk(s, head, input); break;
  }

  return advancePendingQueue(s);
}

// --- Power phase -------------------------------------------------------------

/**
 * Whether `by` may play `card` for `combatant`'s side right now (rulebook
 * p.8-10): Shield is defense-only; Unexpected Allies can only be played for a
 * teammate, never yourself; every other Power card can only be played by the
 * combatant themselves or their Bodyguard (if currently protecting them);
 * Mirror needs some other player to have already played a Power card this
 * combat, or there's nothing for it to copy. Single source of truth for both
 * the reducer's validation and the UI's "don't even offer illegal plays"
 * filtering, so the two can never drift apart.
 */
export function powerCardEligible(
  card: ActionCard,
  by: Player,
  combatant: Player,
  side: CombatSide,
  played: PlayedPowerCard[],
): { enabled: boolean; reason?: string } {
  const isSelf = by.id === combatant.id;
  if (card.name === 'Shield' && side !== 'DEFENDER') {
    return { enabled: false, reason: 'Shield can only be played on defence.' };
  }
  if (card.name === 'Unexpected Allies') {
    if (isSelf) return { enabled: false, reason: 'Unexpected Allies can only be played for a teammate.' };
    if (by.team !== combatant.team) return { enabled: false, reason: 'Unexpected Allies must be played by a teammate.' };
  } else if (!isSelf) {
    const isBodyguard = by.role.id === 'bodyguard' && combatant.hasBodyguardToken && by.team === combatant.team;
    if (!isBodyguard) {
      return { enabled: false, reason: 'Only the combatant (or their Bodyguard) may play that Power card for this side.' };
    }
    if (by.isInjured) {
      return { enabled: false, reason: 'The Bodyguard is injured and cannot play Power cards until they heal.' };
    }
  }
  if (card.name === 'Mirror' && !played.some((p) => p.byPlayerId !== by.id)) {
    return { enabled: false, reason: 'Mirror needs another player to have played a Power card first.' };
  }
  return { enabled: true };
}

/**
 * The power a Power card contributes when played. Returns both the card's own
 * base PL (what Mirror copies) and the final total (base + Mafia Alliance).
 * Mirror copies the base PL of a Power card played earlier this combat by
 * another player (explicit target, else the most recent such card) — and the
 * name of whichever card it copied, for the "used Mirror to copy X" log line.
 */
export function powerCardValue(
  card: ActionCard,
  byPlayer: Player,
  played: PlayedPowerCard[],
  mirrorTargetCardId?: string,
): { basePower: number; power: number; copiedCardName?: string } {
  let basePower: number;
  let copiedCardName: string | undefined;
  if (card.name === 'Mirror') {
    const target = mirrorTargetCardId
      ? played.find((p) => p.cardId === mirrorTargetCardId)
      : [...played].reverse().find((p) => p.byPlayerId !== byPlayer.id);
    basePower = target ? target.basePower : 0;
    copiedCardName = target?.name;
  } else {
    basePower = card.power ?? 0;
  }
  const mafiaBonus = hasItem(byPlayer, 'Mafia Alliance') ? 1 : 0;
  return { basePower, power: basePower + mafiaBonus, copiedCardName };
}

// --- Resolution --------------------------------------------------------------

/**
 * Missile/Molotov Cocktail choices to queue for the winner: one per weapon
 * that triggers it (literally held, or copied via Mutants — copiedWeaponName
 * is set the same way for either), each letting the winner pick which of the
 * loser's perks to destroy. Skipped entirely (no queued choice at all) when
 * the loser has no perk to destroy.
 */
function queueDestroyPerkChoices(combat: CombatState, winner: Player, loser: Player, winnerSide: CombatSide): CombatChoice[] {
  if (!loser.inventory.some((c) => c.type === 'PERK')) return [];
  const triggers: Array<'Missile' | 'Molotov Cocktail'> = [];
  for (const weapon of weaponsOf(winner)) {
    if (weapon.name === 'Missile' || weapon.name === 'Molotov Cocktail') triggers.push(weapon.name);
  }
  const part = winnerSide === 'ATTACKER' ? combat.attacker : combat.defender;
  if (part.copiedWeaponName === 'Missile' || part.copiedWeaponName === 'Molotov Cocktail') {
    triggers.push(part.copiedWeaponName);
  }
  return triggers.map((weaponName) => ({ kind: 'DESTROY_PERK' as const, playerId: winner.id, targetId: loser.id, weaponName, side: winnerSide }));
}

/**
 * Resolve one queued Missile/Molotov destroy-choice (see queueDestroyPerkChoices).
 * Mandatory, like Pistol's discard — no skip variant, since the effect isn't
 * optional, only which perk is. Molotov additionally refunds a Civilian
 * victim the destroyed perk's cost.
 */
function applyDestroyPerk(state: GameState, head: Extract<CombatChoice, { kind: 'DESTROY_PERK' }>, input: CombatChoiceInput): GameState {
  const winner = state.players[playerIndexById(state, head.playerId)];
  const targetIdx = playerIndexById(state, head.targetId);
  const target = state.players[targetIdx];
  const perk = input.kind === 'DESTROY_PERK' ? target?.inventory.find((c) => c.id === input.perkId && c.type === 'PERK') : undefined;
  if (!winner || !target || !perk) return log(state, `Choose one of ${target?.name ?? 'the opponent'}'s perks to destroy.`);

  let s = updatePlayer(state, targetIdx, (p) => ({ ...p, inventory: p.inventory.filter((c) => c.id !== perk.id) }));
  s = log(s, `${winner.name}'s ${head.weaponName} destroys ${target.name}'s ${perk.name}.`);
  if (head.weaponName === 'Molotov Cocktail' && target.team === 'CIVILIAN') {
    s = updatePlayer(s, targetIdx, (p) => ({ ...p, money: p.money + perk.cost }));
    s = log(s, `${target.name} recovers $${perk.cost} for the destroyed perk.`);
  }
  return s;
}

/** Viruses: after combat, each combatant with Viruses gives the other a Virus token. */
function applyVirusTokens(state: GameState, attacker: Player, defender: Player): GameState {
  let s = state;
  const give = (fromId: string, toId: string) => {
    const from = s.players[playerIndexById(s, fromId)];
    if (!hasItem(from, 'Viruses')) return;
    const ti = playerIndexById(s, toId);
    const to = s.players[ti];
    s = updatePlayer(s, ti, (p) => ({ ...p, virusTokens: (p.virusTokens ?? 0) + 1 }));
    s = log(s, `${from.name}'s Viruses give ${to.name} a Virus token (−1 action next turn).`);
  };
  give(attacker.id, defender.id);
  give(defender.id, attacker.id);
  return s;
}

/**
 * A non-injured, non-captured Nurse teammate of `injured` (excluding `injured`
 * themselves — Triage heals a teammate, not yourself) who actually holds a
 * card to discard. Undefined when Triage has no one available to offer it to.
 */
function findAvailableNurse(state: GameState, injured: Player): Player | undefined {
  return state.players.find(
    (p) =>
      p.team === injured.team &&
      p.id !== injured.id &&
      p.role.id === 'nurse' &&
      !p.isInjured &&
      !p.isCaptured &&
      p.hand.length > 0,
  );
}

/**
 * Injure the defender (Nurse declined or wasn't available) and, if there's
 * discarded Evidence to reclaim, hand off to the Leaving Evidence AFTER-phase
 * choice; otherwise close the fight.
 */
function injureAndMaybeLeaveEvidence(state: GameState, combat: CombatState, defender: Player): GameState {
  const defIdx = playerIndexById(state, defender.id);
  let s = updatePlayer(state, defIdx, (p) => ({ ...p, isInjured: true }));
  s = log(s, `${defender.name} is injured until the end of their next turn.`);

  const leavingEvidence = s.discardPile.some((c) => c.type === 'EVIDENCE');
  if (leavingEvidence) {
    s = log(s, `Leaving Evidence: ${defender.name} may shuffle up to 2 discarded Evidence cards into the deck.`);
    return {
      ...s,
      combat: { ...combat, phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: defender.id, side: 'DEFENDER' }] },
    };
  }
  return { ...s, combat: null };
}

/**
 * Splice any queued destroy-perk choices (see queueDestroyPerkChoices) in
 * front of whatever AFTER-phase result the caller already computed —
 * `result.combat` is either null (fight closes) or already carries its own
 * pending item (Triage, Leaving Evidence). Both cases just gain a new front.
 */
function withPendingPrefix(combat: CombatState, prefix: CombatChoice[], result: GameState): GameState {
  if (prefix.length === 0) return result;
  const restPending = result.combat?.pending ?? [];
  return { ...result, combat: { ...combat, phase: 'AFTER', pending: [...prefix, ...restPending] } };
}

/**
 * Resolve the pending combat: compare totals (defender wins ties), apply the
 * VP/injury/capture outcome and after-combat weapon effects, and clear combat
 * — unless a Missile/Molotov destroy-perk choice, then a Nurse teammate's
 * Triage (see findAvailableNurse), pause the AFTER phase first.
 */
export function resolveCombat(state: GameState): GameState {
  const combat = state.combat;
  if (!combat) return state;

  const attacker = state.players[playerIndexById(state, combat.attacker.playerId)];
  const defender = state.players[playerIndexById(state, combat.defender.playerId)];
  const atkTotal = combat.attacker.basePower + combat.attacker.powerCardBonus;
  const defTotal = combat.defender.basePower + combat.defender.powerCardBonus;
  const attackerWins = atkTotal > defTotal; // defender wins ties

  // Keep `combat` set through outcome application; close it (or hand off to an
  // AFTER-phase choice — destroy-perk, Triage, then Leaving Evidence) at the end.
  let s: GameState = log(state, `Combat resolves — ${attacker.name}: ${atkTotal} vs ${defender.name}: ${defTotal}.`);

  if (!attackerWins) {
    s = log(s, `${attacker.name}'s attack fails.`);
    s = applyVirusTokens(s, attacker, defender);
    // A repelling defender "wins" this combat too — their own (or a
    // Mutants-copied) Missile/Molotov Cocktail still destroys a perk, same
    // as an attacker's win, just with the roles reversed.
    const destroyChoices = queueDestroyPerkChoices(combat, defender, attacker, 'DEFENDER');
    return withPendingPrefix(combat, destroyChoices, { ...s, combat: null });
  }

  if (attacker.team === 'CIVILIAN') {
    // Civilian beats an exposed Criminal → capture (loses ability permanently).
    const defIdx = playerIndexById(s, defender.id);
    s = updatePlayer(s, defIdx, (p) => ({ ...p, isCaptured: true, isExposed: false }));
    s = applyScore(s, 'CIVILIAN', 1, `${attacker.name} captures ${defender.name}! Civilians score a VP.`);
    s = applyVirusTokens(s, attacker, defender);
    const destroyChoices = queueDestroyPerkChoices(combat, attacker, defender, 'ATTACKER');
    return withPendingPrefix(combat, destroyChoices, { ...s, combat: null });
  }

  s = applyScore(s, 'CRIMINAL', 1, `${attacker.name} defeats ${defender.name}! Criminals score a VP.`);
  s = applyVirusTokens(s, attacker, defender);
  const destroyChoices = queueDestroyPerkChoices(combat, attacker, defender, 'ATTACKER');

  if (defender.role.id === 'vigilante') {
    const closed = { ...log(s, `${defender.name} is a Vigilante and cannot be injured.`), combat: null };
    return withPendingPrefix(combat, destroyChoices, closed);
  }

  const nurse = findAvailableNurse(s, defender);
  if (nurse) {
    s = log(s, `${defender.name} would be injured — ${nurse.name} may use Triage to prevent it.`);
    return withPendingPrefix(combat, destroyChoices, {
      ...s,
      combat: { ...combat, phase: 'AFTER', pending: [{ kind: 'NURSE_HEAL', playerId: nurse.id, injuredId: defender.id, side: 'DEFENDER' }] },
    });
  }

  return withPendingPrefix(combat, destroyChoices, injureAndMaybeLeaveEvidence(s, combat, defender));
}

/** Opposite side helper. */
export function otherSide(side: CombatSide): CombatSide {
  return side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER';
}
