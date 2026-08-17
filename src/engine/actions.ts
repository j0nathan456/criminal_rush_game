/**
 * src/engine/actions.ts
 *
 * Pure helper describing which turn actions are currently *legal* for a player,
 * so the UI can grey out choices that would be rejected by the reducer. Lives in
 * its own file (not rules.ts) to freely reuse combat's `attackError` without a
 * circular import — combat.ts already depends on rules.ts.
 */

import type { GameState, PlayerActionType } from '../types/game.js';
import type { ActionCard } from '../types/cards.js';
import { isGridComplete } from './rules.js';
import { attackError } from './combat.js';

export interface ActionAvailability {
  enabled: boolean;
  /** Short explanation shown as a tooltip when the action is disabled. */
  reason?: string;
}

/** True when `player` could sell at least one inventory item for $1. */
function hasSellableItem(inventory: GameState['players'][number]['inventory']): boolean {
  return inventory.some((c) => c.type !== 'SPECIAL' && c.name !== 'Investment');
}

/** True when any player is a legal Combat target for the attacker at `index`. */
function hasAttackTarget(state: GameState, index: number): boolean {
  return state.players.some((p) => attackError(state, index, p) === null);
}

/** True when at least one Criminal can still be Exposed (not captured/exposed/disguised). */
function hasExposableCriminal(state: GameState): boolean {
  return state.players.some(
    (p) =>
      p.team === 'CRIMINAL' &&
      !p.isCaptured &&
      !p.isExposed &&
      !p.inventory.some((c) => c.name === 'Disguise'),
  );
}

/**
 * Semantic availability for each turn action (ignores AP cost — the caller still
 * gates on `actionsRemaining`, which it knows from the constants layer). Returns
 * only the entries that can be disabled; anything absent should be treated as
 * enabled. Encodes the same guards the reducer enforces, using the player's real
 * per-turn flags (replacing the never-wired `usedThisTurn` list).
 */
export function actionAvailability(
  state: GameState,
  playerIndex: number,
): Partial<Record<PlayerActionType, ActionAvailability>> {
  const player = state.players[playerIndex];
  if (!player) return {};

  const availability: Partial<Record<PlayerActionType, ActionAvailability>> = {};

  availability.PLAY_CARD =
    player.hand.length > 0 ? { enabled: true } : { enabled: false, reason: 'Your hand is empty.' };

  availability.SELL_ITEM = hasSellableItem(player.inventory)
    ? { enabled: true }
    : { enabled: false, reason: 'You have no items to sell.' };

  availability.PURCHASE_MARKET = player.hasPurchasedFromMarket
    ? { enabled: false, reason: 'Already bought this turn.' }
    : { enabled: true };

  availability.ROLE_ABILITY = player.isCaptured
    ? { enabled: false, reason: 'Captured — your role ability is gone.' }
    : player.isInjured
      ? { enabled: false, reason: "You can't use a role ability while injured." }
      : player.hasUsedRoleAbility
        ? { enabled: false, reason: 'Role ability already used this turn.' }
        : { enabled: true };

  if (player.hasAttacked) {
    availability.COMBAT = { enabled: false, reason: 'Already attacked this turn.' };
  } else if (player.isInjured || player.isCaptured) {
    availability.COMBAT = { enabled: false, reason: "You can't attack in your current state." };
  } else if (!hasAttackTarget(state, playerIndex)) {
    availability.COMBAT = { enabled: false, reason: 'No valid target to attack.' };
  } else {
    availability.COMBAT = { enabled: true };
  }

  // SPECIAL_GOAL: Civilians Expose (needs a full grid + a Criminal), Criminals
  // Expand Network (guidance to buy — always offered, only AP-gated).
  if (player.team === 'CIVILIAN') {
    if (!isGridComplete(state.evidenceGrid)) {
      availability.SPECIAL_GOAL = { enabled: false, reason: 'Evidence grid is not full.' };
    } else if (!hasExposableCriminal(state)) {
      availability.SPECIAL_GOAL = { enabled: false, reason: 'No Criminal left to expose.' };
    } else {
      availability.SPECIAL_GOAL = { enabled: true };
    }
  } else {
    availability.SPECIAL_GOAL = { enabled: true };
  }

  return availability;
}

/**
 * Whether a single hand card can be played *right now*, mirroring the reducer's
 * `playCard` gate so the hand can grey out illegal cards. Power cards resolve
 * only inside a combat (via the combat panel, not `PLAY_CARD`); every other card
 * is a normal turn action and cannot be played mid-combat. Off-turn, nothing in
 * hand is playable. Ignores AP — the caller still knows `actionsRemaining`.
 */
export function handCardPlayable(
  state: GameState,
  playerIndex: number,
  card: ActionCard,
): ActionAvailability {
  const player = state.players[playerIndex];
  if (!player) return { enabled: false };
  if (state.currentPlayerIndex !== playerIndex) {
    return { enabled: false, reason: 'Wait for your turn.' };
  }
  if (card.type === 'POWER') {
    return state.combat
      ? { enabled: true }
      : { enabled: false, reason: 'Power cards can only be played during combat.' };
  }
  // MONEY / EVENT / EVIDENCE — normal turn actions, blocked while a fight is open.
  if (state.combat) return { enabled: false, reason: 'Resolve the current combat first.' };
  return { enabled: true };
}
