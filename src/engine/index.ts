/**
 * src/engine/index.ts
 *
 * Public surface of the game engine. All pure game logic — state creation,
 * the reducer, scoring, and helpers. UI-agnostic and free of any `constants`
 * import; card/role/config data is passed in by the `setup` layer.
 */

export { createGame } from './createGame.js';
export type { CreateGameOptions } from './createGame.js';

export { gameReducer, emptyGameState } from './reducer.js';
export type { GameAction, RoleAbilityPayload, EventOptions, TradeItem, PerkPayload } from './reducer.js';

export { determineWinner } from './scoring.js';
export {
  ACTIONS_PER_TURN,
  ACTIONABLE_PERKS,
  actionsForTurn,
  isGridComplete,
  neighborIds,
} from './rules.js';
export { actionAvailability, handCardPlayable } from './actions.js';
export type { ActionAvailability } from './actions.js';
export {
  computeBasePower,
  weaponPower,
  weaponsOf,
  hasWeaponType,
  hasItem,
  attackError,
  attackActionCost,
  resolvePreCombat,
  powerCardEligible,
  powerCardValue,
  resolveCombat,
  otherSide,
  buildPendingChoices,
  enterPowerPhase,
  applyCombatChoice,
} from './combat.js';

export { shuffle, expandDefs, buildDrawPile, deal } from './deck.js';
export type { Rng, Definition } from './deck.js';
