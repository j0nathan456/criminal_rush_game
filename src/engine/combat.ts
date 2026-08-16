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
  GameState, Player, CombatSide, PlayedPowerCard, CombatChoice, CombatChoiceInput,
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
 * A combatant's base power before any Power cards: current PL (role base minus
 * expose, plus permanent gains already folded into powerLevel) + weapons +
 * Hitman's attack bonus + Bodyguard's defensive bonus.
 */
export function computeBasePower(
  self: Player,
  opponent: Player,
  opts: { isAttacker: boolean; playerCount: number },
): number {
  const weapons = weaponsOf(self);
  const weaponSum = weapons.reduce((sum, w) => sum + weaponPower(w, self, opponent, opts.playerCount), 0);
  const hitmanBonus = opts.isAttacker && self.role.id === 'hitman' ? weapons.length : 0;
  const bodyguardBonus = !opts.isAttacker && self.hasBodyguardToken ? 2 : 0;
  return self.powerLevel + weaponSum + hitmanBonus + bodyguardBonus;
}

// --- Targeting & cost --------------------------------------------------------

/** Weapons that let the holder attack beyond their two neighbors. */
function canReachNonNeighbors(player: Player): boolean {
  return hasItem(player, 'Catapult') || hasItem(player, 'Machine Gun');
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

  if (!neighborIds(state, attackerIndex).includes(target.id) && !canReachNonNeighbors(attacker)) {
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

/** Apply one player's before-combat weapon effects against their opponent. */
function preCombatFor(state: GameState, selfId: string, oppId: string, isAttacker: boolean): GameState {
  const self = state.players[playerIndexById(state, selfId)];
  let s = state;
  for (const weapon of weaponsOf(self)) {
    switch (weapon.name) {
      case 'Hammer':
        s = log(s, `${self.name}'s Hammer draws a card before combat.`);
        s = drawForPlayer(s, selfId);
        break;
      case 'Pistol':
        s = discardFirstCard(s, selfId, 'Pistol');
        break;
      case 'Barbed Wire':
        s = discardFirstCard(s, oppId, 'Barbed Wire');
        break;
      case 'Mosquitos':
        s = discardFirstCard(s, oppId, 'Mosquitos');
        break;
      case 'Brass Knuckles': {
        if (!isAttacker) break;
        const oppIdx = playerIndexById(s, oppId);
        const opp = s.players[oppIdx];
        if (opp && opp.money > 0) {
          s = updatePlayer(s, oppIdx, (p) => ({ ...p, money: p.money - 1 }));
          s = updatePlayer(s, playerIndexById(s, selfId), (p) => ({ ...p, money: p.money + 1 }));
          s = log(s, `${self.name}'s Brass Knuckles steal $1 from ${opp.name}.`);
        }
        break;
      }
      // Portal (draw/swap), Drones (exchange), and Mutants (copy) are interactive
      // choices resolved in the PRE phase — see buildPendingChoices / applyCombatChoice.
      default:
        break;
    }
  }
  return s;
}

/** Resolve every before-combat weapon effect: attacker first, then defender. */
export function resolvePreCombat(state: GameState, attackerId: string, defenderId: string): GameState {
  let s = preCombatFor(state, attackerId, defenderId, true);
  s = preCombatFor(s, defenderId, attackerId, false);
  return s;
}

// --- Interactive pre-combat choices (Portal / Drones / Mutants) --------------

/** Weapons that require an interactive pre-combat decision. */
const CHOICE_WEAPONS: Record<string, CombatChoice['kind']> = {
  Portal: 'PORTAL',
  Drones: 'DRONES',
  Mutants: 'MUTANTS',
};

/**
 * Build the queue of interactive pre-combat choices — attacker's weapons first,
 * then the defender's. The Power phase begins once all are resolved.
 */
export function buildPendingChoices(state: GameState, attackerId: string, defenderId: string): CombatChoice[] {
  const choices: CombatChoice[] = [];
  const add = (playerId: string, side: CombatSide) => {
    const player = state.players[playerIndexById(state, playerId)];
    if (!player) return;
    for (const w of weaponsOf(player)) {
      const kind = CHOICE_WEAPONS[w.name];
      if (kind && kind !== 'LEAVING_EVIDENCE') choices.push({ kind, playerId, weaponId: w.id, side } as CombatChoice);
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
  const atkBase = computeBasePower(atk, def, { isAttacker: true, playerCount: pc }) + (combat.attacker.copiedWeaponPower ?? 0);
  const defBase = computeBasePower(def, atk, { isAttacker: false, playerCount: pc }) + (combat.defender.copiedWeaponPower ?? 0);
  return log(
    {
      ...state,
      combat: {
        ...combat,
        phase: 'POWER',
        attacker: { ...combat.attacker, basePower: atkBase, canPlayPower: !hasItem(def, 'Signal Jammer') },
        defender: { ...combat.defender, basePower: defBase, canPlayPower: !hasItem(atk, 'Signal Jammer') },
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

function applyDrones(state: GameState, head: Extract<CombatChoice, { kind: 'DRONES' }>, input: CombatChoiceInput): GameState {
  if (input.kind !== 'DRONES' || input.mode !== 'EXCHANGE') {
    return log(state, `${state.players[playerIndexById(state, head.playerId)].name} skips the Drones exchange.`);
  }
  const hi = playerIndexById(state, head.playerId);
  const holder = state.players[hi];
  const ti = playerIndexById(state, input.teammateId);
  const teammate = state.players[ti];
  const mine = holder.hand.find((c) => c.id === input.cardId);
  const theirs = teammate?.hand.find((c) => c.id === input.teammateCardId);
  if (!teammate || teammate.id === holder.id || teammate.team !== holder.team || !mine || !theirs) {
    return log(state, 'Invalid Drones exchange.');
  }
  let s = updatePlayer(state, hi, (p) => ({ ...p, hand: [...p.hand.filter((c) => c.id !== mine.id), theirs] }));
  s = updatePlayer(s, ti, (p) => ({ ...p, hand: [...p.hand.filter((c) => c.id !== theirs.id), mine] }));
  return log(s, `${holder.name} exchanges a card with ${teammate.name} via Drones.`);
}

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
  const copied = weaponPower(weapon, holder, opp, combat.playerCount);
  const part = head.side === 'ATTACKER' ? combat.attacker : combat.defender;
  const newPart = { ...part, copiedWeaponPower: (part.copiedWeaponPower ?? 0) + copied };
  const newCombat = head.side === 'ATTACKER' ? { ...combat, attacker: newPart } : { ...combat, defender: newPart };
  return log({ ...state, combat: newCombat }, `${holder.name}'s Mutants copy ${weapon.name} (+${copied} power).`);
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
 * Resolve the head pending choice with the player's `input`, pop it, and advance
 * the phase: when the PRE queue empties the Power phase begins; when the AFTER
 * queue empties the fight closes.
 */
export function applyCombatChoice(state: GameState, input: CombatChoiceInput, rng: Rng = Math.random): GameState {
  const combat = state.combat;
  if (!combat || combat.pending.length === 0) return log(state, 'No pending combat choice.');
  const head = combat.pending[0];
  if (head.kind !== input.kind) return log(state, `Expected a ${head.kind} choice.`);

  let s = state;
  switch (head.kind) {
    case 'PORTAL': s = applyPortal(s, head, input); break;
    case 'DRONES': s = applyDrones(s, head, input); break;
    case 'MUTANTS': s = applyMutants(s, head, input); break;
    case 'LEAVING_EVIDENCE': s = applyLeavingEvidence(s, head, input, rng); break;
  }

  const current = s.combat;
  if (!current) return s;
  const rest = current.pending.slice(1);
  s = { ...s, combat: { ...current, pending: rest } };
  if (rest.length === 0) {
    if (current.phase === 'PRE') s = enterPowerPhase(s);
    else if (current.phase === 'AFTER') s = { ...s, combat: null };
  }
  return s;
}

// --- Power phase -------------------------------------------------------------

/**
 * The power a Power card contributes when played. Returns both the card's own
 * base PL (what Mirror copies) and the final total (base + Mafia Alliance).
 * Mirror copies the base PL of a Power card played earlier this combat by
 * another player (explicit target, else the most recent such card).
 */
export function powerCardValue(
  card: ActionCard,
  byPlayer: Player,
  played: PlayedPowerCard[],
  mirrorTargetCardId?: string,
): { basePower: number; power: number } {
  let basePower: number;
  if (card.name === 'Mirror') {
    const target = mirrorTargetCardId
      ? played.find((p) => p.cardId === mirrorTargetCardId)
      : [...played].reverse().find((p) => p.byPlayerId !== byPlayer.id);
    basePower = target ? target.basePower : 0;
  } else {
    basePower = card.power ?? 0;
  }
  const mafiaBonus = hasItem(byPlayer, 'Mafia Alliance') ? 1 : 0;
  return { basePower, power: basePower + mafiaBonus };
}

// --- Resolution --------------------------------------------------------------

/** Remove the victim's first destroyable perk (not a weapon or Expand Network). */
function destroyFirstPerk(state: GameState, victimId: string): { state: GameState; perk: MarketCard | null } {
  const idx = playerIndexById(state, victimId);
  const victim = state.players[idx];
  const perkIndex = victim?.inventory.findIndex((c) => c.type === 'PERK') ?? -1;
  if (!victim || perkIndex < 0) return { state, perk: null };
  const perk = victim.inventory[perkIndex];
  const s = updatePlayer(state, idx, (p) => ({
    ...p,
    inventory: p.inventory.filter((_, i) => i !== perkIndex),
  }));
  return { state: s, perk };
}

/** Winner's after-combat weapon effects (Missile / Molotov perk destruction). */
function applyWinnerWeapons(state: GameState, winner: Player, loser: Player): GameState {
  let s = state;
  for (const weapon of weaponsOf(winner)) {
    if (weapon.name === 'Missile' || weapon.name === 'Molotov Cocktail') {
      const { state: after, perk } = destroyFirstPerk(s, loser.id);
      s = after;
      if (perk) {
        s = log(s, `${winner.name}'s ${weapon.name} destroys ${loser.name}'s ${perk.name}.`);
        // Molotov: a Civilian victim recovers the destroyed perk's cost in money.
        if (weapon.name === 'Molotov Cocktail' && loser.team === 'CIVILIAN') {
          const li = playerIndexById(s, loser.id);
          s = updatePlayer(s, li, (p) => ({ ...p, money: p.money + perk.cost }));
          s = log(s, `${loser.name} recovers $${perk.cost} for the destroyed perk.`);
        }
      }
    }
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
 * Resolve the pending combat: compare totals (defender wins ties), apply the
 * VP/injury/capture outcome and after-combat weapon effects, and clear combat.
 */
export function resolveCombat(state: GameState): GameState {
  const combat = state.combat;
  if (!combat) return state;

  const attacker = state.players[playerIndexById(state, combat.attacker.playerId)];
  const defender = state.players[playerIndexById(state, combat.defender.playerId)];
  const atkTotal = combat.attacker.basePower + combat.attacker.powerCardBonus;
  const defTotal = combat.defender.basePower + combat.defender.powerCardBonus;
  const attackerWins = atkTotal > defTotal; // defender wins ties

  // Keep `combat` set through outcome application; close it (or hand off to the
  // AFTER phase for Leaving Evidence) at the end.
  let s: GameState = log(state, `Combat resolves — ${attacker.name}: ${atkTotal} vs ${defender.name}: ${defTotal}.`);

  if (!attackerWins) {
    s = log(s, `${attacker.name}'s attack fails.`);
    s = applyVirusTokens(s, attacker, defender);
    return { ...s, combat: null };
  }

  const defIdx = playerIndexById(s, defender.id);
  let leavingEvidence = false;
  if (attacker.team === 'CRIMINAL') {
    s = applyScore(s, 'CRIMINAL', 1, `${attacker.name} defeats ${defender.name}! Criminals score a VP.`);
    if (defender.role.id === 'vigilante') {
      s = log(s, `${defender.name} is a Vigilante and cannot be injured.`);
    } else {
      s = updatePlayer(s, defIdx, (p) => ({ ...p, isInjured: true }));
      s = log(s, `${defender.name} is injured until the end of their next turn.`);
      // Leaving Evidence: the losing Civilian may reclaim discarded Evidence.
      leavingEvidence = s.discardPile.some((c) => c.type === 'EVIDENCE');
    }
  } else {
    // Civilian beats an exposed Criminal → capture (loses ability permanently).
    s = updatePlayer(s, defIdx, (p) => ({ ...p, isCaptured: true, isExposed: false }));
    s = applyScore(s, 'CIVILIAN', 1, `${attacker.name} captures ${defender.name}! Civilians score a VP.`);
  }

  s = applyWinnerWeapons(s, attacker, defender);
  s = applyVirusTokens(s, attacker, defender);

  if (leavingEvidence) {
    s = log(s, `Leaving Evidence: ${defender.name} may shuffle up to 2 discarded Evidence cards into the deck.`);
    return {
      ...s,
      combat: { ...combat, phase: 'AFTER', pending: [{ kind: 'LEAVING_EVIDENCE', playerId: defender.id, side: 'DEFENDER' }] },
    };
  }
  return { ...s, combat: null };
}

/** Opposite side helper. */
export function otherSide(side: CombatSide): CombatSide {
  return side === 'ATTACKER' ? 'DEFENDER' : 'ATTACKER';
}
