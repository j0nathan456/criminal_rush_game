import { describe, it, expect } from 'vitest';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  applyAction,
  viewFor,
  generateCode,
  RoomError,
  MIN_PLAYERS,
} from './room';
import type { Room } from './protocol';
import { emptyGameState, gameReducer } from '../engine';
import { newGame } from '../setup/newGame';
import type { GameState } from '../types/game';

function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roomWith(names: string[]): Room {
  let room = createRoom({ code: 'ABCD', hostToken: 't0', hostName: names[0], now: 0 });
  names.slice(1).forEach((n, i) => {
    room = joinRoom(room, `t${i + 1}`, n);
  });
  return room;
}

describe('generateCode', () => {
  it('produces a code of the requested length from the safe alphabet', () => {
    const code = generateCode(seeded(1), 4);
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('is deterministic under a seeded rng', () => {
    expect(generateCode(seeded(9))).toBe(generateCode(seeded(9)));
  });
});

describe('room lifecycle', () => {
  it('creates a room with the host in seat 0', () => {
    const room = createRoom({ code: 'ABCD', hostToken: 't0', hostName: 'Ava', now: 5 });
    expect(room.players).toEqual([{ seat: 0, id: 'p0', name: 'Ava', token: 't0' }]);
    expect(room.started).toBe(false);
  });

  it('adds players on join and is idempotent for a repeated token', () => {
    let room = createRoom({ code: 'ABCD', hostToken: 't0', hostName: 'Ava', now: 0 });
    room = joinRoom(room, 't1', 'Ben');
    room = joinRoom(room, 't1', 'Ben'); // repeat
    expect(room.players).toHaveLength(2);
    expect(room.players[1]).toMatchObject({ seat: 1, id: 'p1', name: 'Ben' });
  });

  it('rejects joining a full or started room', () => {
    const full = roomWith(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(() => joinRoom(full, 'x', 'Extra')).toThrow(RoomError);

    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame });
    expect(() => joinRoom(started, 'x', 'Late')).toThrow(RoomError);
  });

  it('only lets the host start, and only with enough players', () => {
    expect(() => startRoom(roomWith(['A', 'B', 'C']), { token: 't0', newGame })).toThrow(
      new RegExp(`at least ${MIN_PLAYERS}`),
    );
    expect(() => startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't1', newGame })).toThrow(/host/);

    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame });
    expect(started.started).toBe(true);
    expect(started.state?.players).toHaveLength(4);
  });
});

describe('applyAction', () => {
  it('applies an action from the current player and rejects others', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame });
    const state = started.state as GameState;
    const currentSeat = state.currentPlayerIndex;
    const currentToken = `t${currentSeat}`;
    const otherToken = `t${(currentSeat + 1) % 4}`;

    expect(() => applyAction(started, { token: otherToken, action: { type: 'DRAW_CARD' }, reducer: gameReducer })).toThrow(
      /not your turn/,
    );

    const after = applyAction(started, { token: currentToken, action: { type: 'DRAW_CARD' }, reducer: gameReducer });
    expect(after.state?.players[currentSeat].hand.length).toBe(state.players[currentSeat].hand.length + 1);
  });

  it('refuses actions before the game starts', () => {
    const room = roomWith(['A', 'B', 'C', 'D']);
    expect(() => applyAction(room, { token: 't0', action: { type: 'DRAW_CARD' }, reducer: gameReducer })).toThrow(
      /not started/,
    );
  });
});

describe('viewFor redaction', () => {
  function startedRoomWithState(state: GameState): Room {
    return { code: 'ABCD', createdAt: 0, started: true, players: roomWith(['A', 'B']).players, state };
  }

  it("hides other players' hands and the draw pile, but not your own hand", () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [
        { ...playerStub('p0', 'A'), hand: [card('a1'), card('a2')] },
        { ...playerStub('p1', 'B'), hand: [card('b1'), card('b2'), card('b3')] },
      ],
      drawPile: [card('d1'), card('d2')],
    };
    const room = startedRoomWithState(state);

    const view = viewFor(room, 't0'); // seat 0 = p0
    expect(view.yourSeat).toBe(0);
    expect(view.state?.players[0].hand.map((c) => c.id)).toEqual(['a1', 'a2']); // own hand intact
    expect(view.state?.players[1].hand).toHaveLength(3); // count preserved
    expect(view.state?.players[1].hand.every((c) => c.name === 'Hidden')).toBe(true);
    expect(view.state?.drawPile.every((c) => c.name === 'Hidden')).toBe(true);
  });

  it('reveals the Spy peek only to its owner', () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [playerStub('p0', 'A'), playerStub('p1', 'B')],
      lastPeek: { playerId: 'p1', cards: [card('secret')] },
    };
    const room = startedRoomWithState(state);

    expect(viewFor(room, 't1').state?.lastPeek?.cards).toHaveLength(1); // owner (seat 1)
    expect(viewFor(room, 't0').state?.lastPeek).toBeNull(); // everyone else
  });
});

describe('leaveRoom', () => {
  it('removes a player from a pre-game room and re-seats the rest contiguously', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']); // tokens t0..t3
    const after = leaveRoom(room, 't1'); // Ben (seat 1) leaves

    expect(after.players).toHaveLength(3);
    expect(after.players.map((p) => p.name)).toEqual(['Ava', 'Cara', 'Dev']);
    // seats and ids are renumbered so they stay contiguous
    expect(after.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(after.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
  });

  it('is a no-op for an unknown token', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(leaveRoom(room, 'nope')).toBe(room);
  });

  it('does not remove seats once the game has started', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame });
    expect(leaveRoom(started, 't1').players).toHaveLength(4);
  });

  it('can empty a room (caller then deletes it)', () => {
    let room = createRoom({ code: 'ABCD', hostToken: 't0', hostName: 'Solo', now: 0 });
    room = leaveRoom(room, 't0');
    expect(room.players).toHaveLength(0);
  });
});

// --- small stubs ---
import type { ActionCard } from '../types/cards';
import type { Player, RoleIdentity } from '../types/game';

function card(id: string): ActionCard {
  return { id, name: id, description: '', type: 'MONEY', value: 1 };
}
function playerStub(id: string, name: string): Player {
  const role: RoleIdentity = { id: 'r', name: 'r', team: 'CIVILIAN', powerlevel: 3, abilityName: '', abilityDescription: '' };
  return {
    id, name, team: 'CIVILIAN', role, hand: [], inventory: [], money: 2, powerLevel: 3,
    actionsRemaining: 3, hasPurchasedFromMarket: false, hasUsedRoleAbility: false,
    isInjured: false, isExposed: false, isCaptured: false,
  };
}
