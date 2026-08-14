/**
 * src/setup/newGame.ts
 *
 * The bridge between `constants` (card/role/config data) and `engine` (pure
 * logic). This is the ONLY layer allowed to import both. It injects the game
 * data into the engine's createGame() so the engine stays data-agnostic.
 */

import { createGame } from '../engine/index.js';
import type { Rng } from '../engine/index.js';
import type { GameState } from '../types/game.js';
import { ROLES } from '../constants/roles.js';
import { GAME_CONFIGS } from '../constants/setup.js';
import {
  ACTION_CARD_DEFS,
  MARKET_PERKS,
  MARKET_WEAPONS,
  BLACK_MARKET_PERKS,
  BLACK_MARKET_WEAPONS,
  EXPAND_NETWORK,
} from '../constants/cards.js';

/** The player counts the rulebook supports. */
export const SUPPORTED_PLAYER_COUNTS = [4, 5, 6, 7, 8];

/**
 * Create a fresh, playable game for the given players (4-8). Pass a seeded
 * `rng` for deterministic setups (tests); omit it for real shuffles.
 */
export function newGame(playerNames: string[], rng?: Rng): GameState {
  const config = GAME_CONFIGS[playerNames.length];
  if (!config) {
    throw new Error(
      `Unsupported player count: ${playerNames.length}. Supported: ${SUPPORTED_PLAYER_COUNTS.join(', ')}.`,
    );
  }

  return createGame({
    playerNames,
    roles: ROLES,
    config,
    actionDefs: ACTION_CARD_DEFS,
    publicMarketDefs: [...MARKET_PERKS, ...MARKET_WEAPONS],
    blackMarketDefs: [...BLACK_MARKET_PERKS, ...BLACK_MARKET_WEAPONS],
    expandNetworkDef: EXPAND_NETWORK,
    rng,
  });
}
