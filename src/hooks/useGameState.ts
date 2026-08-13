/**
 * src/hooks/useGameState.ts
 *
 * Backwards-compatible alias. The game state hook now lives in the `setup`
 * layer (it needs both constants data and the engine). This re-export keeps
 * the historical import path working.
 *
 * Prefer importing from `../setup` directly in new code.
 */

export { useCriminalRush, useCriminalRush as useGameState } from '../setup';
export type { GameDispatch } from '../setup';
