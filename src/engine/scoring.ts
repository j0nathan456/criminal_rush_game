import type { Team } from '../types/game';

/**
 * Pure game logic for determining the game winner.
 *
 * Lives in the engine area: no UI, no React, no imports from `constants`.
 * Takes the current team scores and victory-point targets and returns the
 * winning team, or `current` (default `null`) if no target has been reached.
 *
 * Tie-breaker: Civilians are checked first, so if both teams reach their
 * target on the same update, Civilians win.
 */
export function determineWinner(
  scores: Record<Team, number>,
  targets: Record<Team, number>,
  current: Team | null = null,
): Team | null {
  if (scores.CIVILIAN >= targets.CIVILIAN) return 'CIVILIAN';
  if (scores.CRIMINAL >= targets.CRIMINAL) return 'CRIMINAL';
  return current;
}
