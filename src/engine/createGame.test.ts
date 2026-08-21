import { describe, it, expect } from 'vitest';
import type { RoleIdentity, GameConfig, Team } from '../types/game.js';
import { createGame, type CreateGameOptions } from './createGame.js';
import { gameReducer } from './reducer.js';

/** Deterministic PRNG so role/market shuffles are reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function role(id: string, team: Team): RoleIdentity {
  return { id, name: id, team, powerlevel: 3, abilityName: '', abilityDescription: '' };
}

/** civilians/criminals roles must each have at least as many entries as the player count needs. */
function options(playerNames: string[], roles: RoleIdentity[], rng: () => number): CreateGameOptions {
  const config: GameConfig = {
    civilians: playerNames.filter((_, i) => i % 2 === 0).length,
    criminals: playerNames.filter((_, i) => i % 2 === 1).length,
    vpTargets: { CIVILIAN: 9, CRIMINAL: 9 },
    civSetup: { startingCards: 0, startingMoney: 5 },
    crimSetup: { startingCards: 0, startingMoney: 5 },
  };
  return { playerNames, roles, config, actionDefs: [], publicMarketDefs: [], blackMarketDefs: [], rng };
}

describe('createGame — Bodyguard Protection token', () => {
  it('4 players: only one possible teammate — assigns the token automatically, no pending choice', () => {
    const roles = [role('bodyguard', 'CIVILIAN'), role('mayor', 'CIVILIAN'), role('hitman', 'CRIMINAL'), role('robber', 'CRIMINAL')];
    const state = createGame(options(['A', 'B', 'C', 'D'], roles, seeded(1)));

    expect(state.pendingBodyguardSetup).toBeNull();
    const bodyguard = state.players.find((p) => p.role.id === 'bodyguard')!;
    const holder = state.players.find((p) => p.hasBodyguardToken);
    expect(holder).toBeDefined();
    expect(holder!.id).not.toBe(bodyguard.id); // given to the teammate, not themselves
    expect(holder!.team).toBe('CIVILIAN');
  });

  it('5+ players: 2+ possible teammates — offers a real choice instead of auto-assigning', () => {
    const roles = [
      role('bodyguard', 'CIVILIAN'), role('mayor', 'CIVILIAN'), role('sheriff', 'CIVILIAN'),
      role('hitman', 'CRIMINAL'), role('robber', 'CRIMINAL'),
    ];
    const state = createGame(options(['A', 'B', 'C', 'D', 'E'], roles, seeded(2)));

    expect(state.players.some((p) => p.hasBodyguardToken)).toBe(false); // nobody holds it yet
    const bodyguard = state.players.find((p) => p.role.id === 'bodyguard')!;
    expect(state.pendingBodyguardSetup).toEqual({ bodyguardId: bodyguard.id });
  });

  it('resolves the pending choice: the Bodyguard picks who gets the token, then play can proceed', () => {
    const roles = [
      role('bodyguard', 'CIVILIAN'), role('mayor', 'CIVILIAN'), role('sheriff', 'CIVILIAN'),
      role('hitman', 'CRIMINAL'), role('robber', 'CRIMINAL'),
    ];
    const state = createGame(options(['A', 'B', 'C', 'D', 'E'], roles, seeded(2)));
    const bodyguard = state.players.find((p) => p.role.id === 'bodyguard')!;
    const teammates = state.players.filter((p) => p.team === 'CIVILIAN' && p.id !== bodyguard.id);
    expect(teammates).toHaveLength(2);

    // Other actions are blocked (even a plain draw) until it's resolved.
    const blocked = gameReducer(state, { type: 'DRAW_CARD' });
    expect(blocked.pendingBodyguardSetup).not.toBeNull();
    expect(blocked.players.every((p) => p.hand.length === 0)).toBe(true);

    const chosen = teammates[1];
    const next = gameReducer(state, { type: 'RESOLVE_BODYGUARD_SETUP', targetId: chosen.id });
    expect(next.pendingBodyguardSetup).toBeNull();
    expect(next.players.find((p) => p.id === chosen.id)?.hasBodyguardToken).toBe(true);
    expect(next.players.filter((p) => p.hasBodyguardToken)).toHaveLength(1);
  });
});

describe('createGame — turn order alternates by team', () => {
  function rolesFor(n: number): RoleIdentity[] {
    return [
      ...Array.from({ length: n }, (_, i) => role(`civ${i}`, 'CIVILIAN')),
      ...Array.from({ length: n }, (_, i) => role(`crim${i}`, 'CRIMINAL')),
    ];
  }

  it('strictly alternates teams, including the wrap-around, at every even player count', () => {
    for (const n of [4, 6, 8]) {
      for (let seed = 1; seed <= 15; seed++) {
        const names = Array.from({ length: n }, (_, i) => `P${i}`);
        const state = createGame(options(names, rolesFor(n), seeded(seed * 1000 + n)));
        const teams = state.players.map((p) => p.team);
        for (let i = 0; i < n; i++) {
          expect(teams[i]).not.toBe(teams[(i + 1) % n]);
        }
      }
    }
  });

  it('allows exactly one adjacent same-team pair — the extra Civilian — at every odd player count', () => {
    for (const n of [5, 7]) {
      for (let seed = 1; seed <= 15; seed++) {
        const names = Array.from({ length: n }, (_, i) => `P${i}`);
        const state = createGame(options(names, rolesFor(n), seeded(seed * 1000 + n)));
        const teams = state.players.map((p) => p.team);
        let sameTeamAdjacentPairs = 0;
        for (let i = 0; i < n; i++) {
          if (teams[i] === teams[(i + 1) % n]) {
            sameTeamAdjacentPairs++;
            expect(teams[i]).toBe('CIVILIAN'); // the larger team, never the Criminals
          }
        }
        expect(sameTeamAdjacentPairs).toBe(1);
      }
    }
  });

  it("team no longer tracks lobby join order — the host isn't always the same team", () => {
    const names = ['A', 'B', 'C', 'D'];
    const hostTeams = new Set<Team>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = createGame(options(names, rolesFor(4), seeded(seed)));
      hostTeams.add(state.players.find((p) => p.name === 'A')!.team);
    }
    expect(hostTeams).toEqual(new Set(['CIVILIAN', 'CRIMINAL'])); // both seen across enough seeds
  });
});
