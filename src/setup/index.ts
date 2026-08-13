/**
 * src/setup/index.ts
 *
 * The wiring layer's public surface. Dependency direction:
 *   constants ─┐
 *              ├──▶ setup ──▶ engine
 *   engine   ──┘
 * Setup is the only place that imports both constants and engine.
 */

export { newGame, SUPPORTED_PLAYER_COUNTS } from './newGame';
