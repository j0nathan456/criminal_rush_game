/**
 * src/engine/index.ts
 *
 * Public surface of the game engine. All pure game logic — state creation,
 * the reducer, scoring, and helpers. UI-agnostic and free of any `constants`
 * import; card/role/config data is passed in by the `setup` layer.
 */

export { createGame } from './createGame';
export type { CreateGameOptions } from './createGame';

export { gameReducer, emptyGameState } from './reducer';
export type { GameAction, RoleAbilityPayload, EventOptions, TradeItem, PerkPayload } from './reducer';

export { determineWinner } from './scoring';
export {
  ACTIONS_PER_TURN,
  actionsForTurn,
  isGridComplete,
  neighborIds,
} from './rules';
export {
  computeBasePower,
  weaponPower,
  weaponsOf,
  hasWeaponType,
  hasItem,
  attackError,
  attackActionCost,
  resolvePreCombat,
  powerCardValue,
  resolveCombat,
  otherSide,
  buildPendingChoices,
  enterPowerPhase,
  applyCombatChoice,
} from './combat';

export { shuffle, expandDefs, buildDrawPile, deal } from './deck';
export type { Rng, Definition } from './deck';
