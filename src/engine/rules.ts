/**
 * src/engine/rules.ts
 *
 * Pure rule helpers shared by the reducer. No React, no UI, no constants
 * imports — just functions over GameState.
 */

import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, Team } from '../types/cards';
import { determineWinner } from './scoring';

/** Base actions granted each turn before role/perk modifiers. */
export const ACTIONS_PER_TURN = 3;

/** Actions a player receives at the start of their turn (Mayor gets +1). */
export function actionsForTurn(player: Player): number {
  return ACTIONS_PER_TURN + (player.role.id === 'mayor' ? 1 : 0);
}

/** True when every evidence category is filled — required to Expose. */
export function isGridComplete(grid: GameState['evidenceGrid']): boolean {
  return (Object.keys(grid) as EvidenceCategory[]).every((c) => grid[c].isFilled);
}

/** Append a message to the game log (returns a new state). */
export function log(state: GameState, message: string): GameState {
  return { ...state, gameLog: [...state.gameLog, message] };
}

/** Index of a player by id, or -1. */
export function playerIndexById(state: GameState, id: string): number {
  return state.players.findIndex((p) => p.id === id);
}

/** Replace one player via an updater function (returns a new state). */
export function updatePlayer(
  state: GameState,
  index: number,
  update: (p: Player) => Player,
): GameState {
  if (index < 0 || index >= state.players.length) return state;
  const players = state.players.slice();
  players[index] = update(players[index]);
  return { ...state, players };
}

/** The ids of the two players seated on either side of `index`. */
export function neighborIds(state: GameState, index: number): string[] {
  const n = state.players.length;
  if (n < 2) return [];
  const left = state.players[(index - 1 + n) % n].id;
  const right = state.players[(index + 1) % n].id;
  return left === right ? [left] : [left, right];
}

/**
 * Add points to a team, recompute the winner (Civilians win ties), and log.
 */
export function applyScore(state: GameState, team: Team, points: number, message: string): GameState {
  const teamScores = { ...state.teamScores, [team]: state.teamScores[team] + points };
  const winner = determineWinner(teamScores, state.vpTargets, state.winner);
  return { ...log({ ...state, teamScores }, message), winner };
}
