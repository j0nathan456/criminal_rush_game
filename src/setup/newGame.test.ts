import { describe, it, expect } from 'vitest';
import { newGame, SUPPORTED_PLAYER_COUNTS } from './newGame.js';
import { GAME_CONFIGS } from '../constants/setup.js';

/** Deterministic PRNG so setup is reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('newGame', () => {
  it('rejects unsupported player counts', () => {
    expect(() => newGame(['only', 'three', 'players'], seeded(1))).toThrow(/Unsupported player count/);
  });

  it.each(SUPPORTED_PLAYER_COUNTS)('sets up a valid %i-player game', (count) => {
    const names = Array.from({ length: count }, (_, i) => `P${i}`);
    const state = newGame(names, seeded(count));
    const config = GAME_CONFIGS[count];

    expect(state.players).toHaveLength(count);
    expect(state.players.filter((p) => p.team === 'CIVILIAN')).toHaveLength(config.civilians);
    expect(state.players.filter((p) => p.team === 'CRIMINAL')).toHaveLength(config.criminals);
    expect(state.vpTargets).toEqual(config.vpTargets);

    // Markets are dealt face-up: 5 public, 3 black + Expand Network.
    expect(state.publicMarket).toHaveLength(5);
    expect(state.blackMarket).toHaveLength(4);
    expect(state.blackMarket.some((c) => c.name === 'Expand Network')).toBe(true);

    // Each player holds their team's starting hand; roles are unique.
    for (const p of state.players) {
      const setup = p.team === 'CIVILIAN' ? config.civSetup : config.crimSetup;
      expect(p.hand).toHaveLength(setup.startingCards);
      expect(p.money).toBe(setup.startingMoney);
    }
    const roleIds = state.players.map((p) => p.role.id);
    expect(new Set(roleIds).size).toBe(count);
  });

  it('starts a Civilian with a full action allotment', () => {
    const state = newGame(['P0', 'P1', 'P2', 'P3'], seeded(5));
    const starter = state.players[state.currentPlayerIndex];
    expect(starter.team).toBe('CIVILIAN');
    // Mayor gets 4 actions, everyone else 3.
    expect(starter.actionsRemaining).toBe(starter.role.id === 'mayor' ? 4 : 3);
  });
});
