/**
 * src/setup/useCriminalRush.ts
 *
 * React binding for the engine. Seeds a game via newGame() (constants + engine)
 * and drives it with the pure gameReducer. This is what the UI consumes.
 */

import { useReducer } from 'react';
import { gameReducer } from '../engine';
import type { GameAction } from '../engine';
import type { GameState } from '../types/game';
import { newGame } from './newGame';

export type GameDispatch = React.Dispatch<GameAction>;

/**
 * Start and manage a Criminal Rush game. Returns the current state and a
 * dispatch for engine actions (DRAW_CARD, PLAY_EVIDENCE, PURCHASE, EXPOSE,
 * ATTACK, END_TURN).
 */
export function useCriminalRush(playerNames: string[]): [GameState, GameDispatch] {
  return useReducer(gameReducer, playerNames, newGame);
}
