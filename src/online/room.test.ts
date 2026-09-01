import { describe, it, expect } from 'vitest';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  kickPlayer,
  rejoinRoom,
  startRoom,
  playAgain,
  applyAction,
  setChatEnabled,
  postChatMessage,
  viewFor,
  isHost,
  generateCode,
  RoomError,
  MIN_PLAYERS,
  MAX_CHAT_MESSAGE_LENGTH,
} from './room.js';
import type { Room } from './protocol.js';
import { emptyGameState, gameReducer } from '../engine/index.js';
import { newGame } from '../setup/newGame.js';
import type { GameState } from '../types/game.js';

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

/**
 * A player's room token, given only their engine `Player`. Tokens are always
 * `t${lobbySeat}` in these fixtures (see roomWith) and ids `p${lobbySeat}`
 * (see protocol.ts), so the numeric suffix carries over — but turn order no
 * longer matches lobby seat (createGame shuffles it), so tests must derive
 * the token from the actual player rather than assume `t${arrayIndex}`.
 */
function tokenFor(player: { id: string }): string {
  return `t${player.id.slice(1)}`;
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

    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    expect(() => joinRoom(started, 'x', 'Late')).toThrow(RoomError);
  });

  it('only lets the host start, and only with enough players', () => {
    expect(() => startRoom(roomWith(['A', 'B', 'C']), { token: 't0', newGame, now: 0 })).toThrow(
      new RegExp(`at least ${MIN_PLAYERS}`),
    );
    expect(() => startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't1', newGame, now: 0 })).toThrow(/host/);

    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 12345 });
    expect(started.started).toBe(true);
    expect(started.state?.players).toHaveLength(4);
    // Distinct from createdAt (lobby-open time) — this is when play actually began.
    expect(started.startedAt).toBe(12345);
  });
});

describe('chat', () => {
  it('defaults to disabled, and only the host can turn it on before the game starts', () => {
    const room = roomWith(['A', 'B', 'C', 'D']);
    expect(room.chatEnabled).toBe(false);

    expect(() => setChatEnabled(room, { hostToken: 't1', enabled: true })).toThrow(/host/);

    const enabled = setChatEnabled(room, { hostToken: 't0', enabled: true });
    expect(enabled.chatEnabled).toBe(true);

    const started = startRoom(enabled, { token: 't0', newGame, now: 0 });
    expect(() => setChatEnabled(started, { hostToken: 't0', enabled: false })).toThrow(/before the game starts/);
  });

  it('refuses to post before chat is enabled or before the game has started', () => {
    const room = roomWith(['A', 'B', 'C', 'D']);
    expect(() => postChatMessage(room, { token: 't0', text: 'hi', now: 0, id: 'm1' })).toThrow(/not enabled/);

    const enabled = setChatEnabled(room, { hostToken: 't0', enabled: true });
    expect(() => postChatMessage(enabled, { token: 't0', text: 'hi', now: 0, id: 'm1' })).toThrow(/game starts/);
  });

  it('posts a message, trims it, caps it at MAX_CHAT_MESSAGE_LENGTH, and colors it by the sender\'s team', () => {
    const enabled = setChatEnabled(roomWith(['A', 'B', 'C', 'D']), { hostToken: 't0', enabled: true });
    const started = startRoom(enabled, { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const overLong = '!'.repeat(MAX_CHAT_MESSAGE_LENGTH + 50);

    const after = postChatMessage(started, { token: 't1', text: `  ${overLong}  `, now: 123, id: 'm1' });
    expect(after.chat).toHaveLength(1);
    const msg = after.chat[0];
    expect(msg).toMatchObject({ id: 'm1', seat: 1, name: 'B', sentAt: 123 });
    expect(msg.text).toHaveLength(MAX_CHAT_MESSAGE_LENGTH);
    expect(msg.team).toBe(state.players.find((p) => p.id === 'p1')!.team); // token t1 = lobby seat 1 = id p1 (Ben)
  });

  it('rejects a blank message', () => {
    const enabled = setChatEnabled(roomWith(['A', 'B', 'C', 'D']), { hostToken: 't0', enabled: true });
    const started = startRoom(enabled, { token: 't0', newGame, now: 0 });
    expect(() => postChatMessage(started, { token: 't0', text: '   ', now: 0, id: 'm1' })).toThrow(/empty/);
  });

  it('caps history so the room record does not grow without bound', () => {
    const enabled = setChatEnabled(roomWith(['A', 'B', 'C', 'D']), { hostToken: 't0', enabled: true });
    let room = startRoom(enabled, { token: 't0', newGame, now: 0 });
    for (let i = 0; i < 205; i++) {
      room = postChatMessage(room, { token: 't0', text: `msg ${i}`, now: i, id: `m${i}` });
    }
    expect(room.chat.length).toBeLessThanOrEqual(200);
    expect(room.chat.at(-1)?.text).toBe('msg 204'); // newest survives the cap
  });

  it('is public in viewFor for every player, unlike hands/draw pile', () => {
    const enabled = setChatEnabled(roomWith(['A', 'B', 'C', 'D']), { hostToken: 't0', enabled: true });
    const started = startRoom(enabled, { token: 't0', newGame, now: 0 });
    const withMsg = postChatMessage(started, { token: 't0', text: 'hello table', now: 0, id: 'm1' });

    expect(viewFor(withMsg, 't0').chat).toHaveLength(1);
    expect(viewFor(withMsg, 't2').chat).toHaveLength(1); // any other seat sees it too
    expect(viewFor(withMsg, 't2').chatEnabled).toBe(true);
  });
});

describe('applyAction', () => {
  it('applies an action from the current player and rejects others', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const currentSeat = state.currentPlayerIndex;
    const currentToken = tokenFor(state.players[currentSeat]);
    const otherToken = tokenFor(state.players[(currentSeat + 1) % 4]);

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

  it('authorizes COMBAT_CHOICE against the pending choice\'s actual decider, not the current turn', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const currentSeat = state.currentPlayerIndex;
    const deciderSeat = (currentSeat + 1) % 4; // e.g. the injured defender in Leaving Evidence — not the current player
    const deciderId = state.players[deciderSeat].id;
    const room: Room = {
      ...started,
      state: {
        ...state,
        combat: {
          attacker: { playerId: state.players[currentSeat].id, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
          defender: { playerId: deciderId, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
          turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 4, phase: 'AFTER',
          pending: [{ kind: 'LEAVING_EVIDENCE', playerId: deciderId, side: 'DEFENDER' }],
        },
      },
    };
    const choice = { type: 'COMBAT_CHOICE' as const, input: { kind: 'LEAVING_EVIDENCE' as const, evidenceIds: [] } };

    // Even the current-turn player (e.g. the attacker who just injured them) can't make this choice.
    expect(() => applyAction(room, { token: tokenFor(state.players[currentSeat]), action: choice, reducer: gameReducer })).toThrow(
      /not your combat choice/,
    );

    // The actual decider succeeds, despite it not being "their turn".
    const after = applyAction(room, { token: tokenFor(state.players[deciderSeat]), action: choice, reducer: gameReducer });
    expect(after.state?.combat).toBeNull();
  });

  it('only lets a combatant PASS_COMBAT for their own side', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const attackerSeat = state.currentPlayerIndex;
    const defenderSeat = (attackerSeat + 1) % 4;
    const room: Room = {
      ...started,
      state: {
        ...state,
        combat: {
          attacker: { playerId: state.players[attackerSeat].id, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
          defender: { playerId: state.players[defenderSeat].id, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
          turn: 'ATTACKER', played: [], actionCost: 2, playerCount: 4, phase: 'POWER', pending: [],
        },
      },
    };

    // The attacker (whose turn it nominally is) cannot pass for the defender.
    expect(() =>
      applyAction(room, { token: tokenFor(state.players[attackerSeat]), action: { type: 'PASS_COMBAT', side: 'DEFENDER' }, reducer: gameReducer }),
    ).toThrow(/only pass for yourself/);

    // The defender can pass for themselves, despite it not being "their turn".
    const after = applyAction(room, { token: tokenFor(state.players[defenderSeat]), action: { type: 'PASS_COMBAT', side: 'DEFENDER' }, reducer: gameReducer });
    expect(after.state?.combat?.defender.passed).toBe(true);
  });

  it('authorizes RESOLVE_THREATEN against the Arsonist\'s target, not the current turn', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const currentSeat = state.currentPlayerIndex;
    const targetSeat = (currentSeat + 1) % 4;
    const room: Room = { ...started, state: { ...state, pendingThreaten: { targetId: state.players[targetSeat].id } } };
    const action = { type: 'RESOLVE_THREATEN' as const, mode: 'MONEY' as const };

    // Even the current-turn player (the Arsonist who threatened them) can't resolve it.
    expect(() => applyAction(room, { token: tokenFor(state.players[currentSeat]), action, reducer: gameReducer })).toThrow(/not your Threaten choice/);

    const after = applyAction(room, { token: tokenFor(state.players[targetSeat]), action, reducer: gameReducer });
    expect(after.state?.pendingThreaten).toBeNull();
  });

  it("authorizes RESOLVE_BODYGUARD_SETUP against the Bodyguard, not the current turn", () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const currentSeat = state.currentPlayerIndex;
    // Team is now assigned independently of seat, so find an actual same-team
    // teammate for the (synthetic) Bodyguard rather than assuming an offset.
    const bodyguardSeat = (currentSeat + 1) % 4;
    const bodyguardTeam = state.players[bodyguardSeat].team;
    const teammateSeat = state.players.findIndex((p, i) => i !== bodyguardSeat && p.team === bodyguardTeam);
    const room: Room = { ...started, state: { ...state, pendingBodyguardSetup: { bodyguardId: state.players[bodyguardSeat].id } } };
    const action = { type: 'RESOLVE_BODYGUARD_SETUP' as const, targetId: state.players[teammateSeat].id };

    // Even the current-turn player isn't necessarily the Bodyguard.
    expect(() => applyAction(room, { token: tokenFor(state.players[currentSeat]), action, reducer: gameReducer })).toThrow(/not your Bodyguard choice/);

    const after = applyAction(room, { token: tokenFor(state.players[bodyguardSeat]), action, reducer: gameReducer });
    expect(after.state?.pendingBodyguardSetup).toBeNull();
  });

  it('authorizes RESOLVE_TRADE_RETURN against the recipient, not the initiator', () => {
    const started = startRoom(roomWith(['A', 'B', 'C', 'D']), { token: 't0', newGame, now: 0 });
    const state = started.state as GameState;
    const initiatorSeat = state.currentPlayerIndex;
    const recipientSeat = (initiatorSeat + 1) % 4;
    const room: Room = {
      ...started,
      state: { ...state, pendingTrade: { initiatorId: state.players[initiatorSeat].id, recipientId: state.players[recipientSeat].id } },
    };
    const action = { type: 'RESOLVE_TRADE_RETURN' as const, give: null };

    // The initiator (whose turn it nominally is) can't answer for the recipient.
    expect(() => applyAction(room, { token: tokenFor(state.players[initiatorSeat]), action, reducer: gameReducer })).toThrow(/not your trade/);

    const after = applyAction(room, { token: tokenFor(state.players[recipientSeat]), action, reducer: gameReducer });
    expect(after.state?.pendingTrade).toBeNull();
  });
});

describe('viewFor redaction', () => {
  function startedRoomWithState(state: GameState): Room {
    return { code: 'ABCD', createdAt: 0, started: true, players: roomWith(['A', 'B']).players, state, chatEnabled: false, chat: [] };
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

  it('yourPlayerIndex tracks id, not array position — createGame reorders state.players into turn order, which need not match lobby seat', () => {
    const base = emptyGameState();
    // Lobby seat 0 (token t0, id p0) landed second in turn order here — the
    // exact "seat != state.players index" case that broke the online client
    // before yourPlayerIndex existed (it used to index state.players with
    // the raw lobby seat).
    const state: GameState = {
      ...base,
      players: [
        { ...playerStub('p1', 'B'), hand: [card('b1')] },
        { ...playerStub('p0', 'A'), hand: [card('a1'), card('a2')] },
      ],
    };
    const room = startedRoomWithState(state);

    const view = viewFor(room, 't0'); // seat 0 = p0, sitting at state.players[1]
    expect(view.yourSeat).toBe(0);
    expect(view.yourPlayerIndex).toBe(1);
    expect(view.state?.players[1].hand.map((c) => c.id)).toEqual(['a1', 'a2']); // own hand intact
    expect(view.state?.players[0].hand.every((c) => c.name === 'Hidden')).toBe(true); // not-me, hidden
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

  it("reveals the Sheriff's subpoena only to the Sheriff", () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [playerStub('p0', 'A'), playerStub('p1', 'B')],
      pendingSheriff: { sheriffId: 'p0', targetId: 'p1', cards: [card('secret')] },
    };
    const room = startedRoomWithState(state);

    expect(viewFor(room, 't0').state?.pendingSheriff?.cards).toHaveLength(1); // the Sheriff (seat 0)
    expect(viewFor(room, 't1').state?.pendingSheriff).toBeNull(); // everyone else
  });

  it("reveals Shady Press's forced-card reveal only to the presser, even though the target's hand is otherwise redacted", () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [
        { ...playerStub('p0', 'A'), hand: [] },
        { ...playerStub('p1', 'B'), hand: [card('e1')] }, // the pressed opponent's real hand
      ],
      pendingShadyPress: { pressId: 'p0', targetId: 'p1', perkCardId: 'sp', cards: [card('e1')] },
    };
    const room = startedRoomWithState(state);

    const pressersView = viewFor(room, 't0');
    expect(pressersView.state?.pendingShadyPress?.cards).toHaveLength(1); // the presser (seat 0) sees the reveal
    // Confirms the reveal doesn't depend on the target's (redacted) hand:
    // seat 1's own hand is hidden from the presser, yet the pending reveal
    // still carries the real card.
    expect(pressersView.state?.players[1].hand.every((c) => c.name === 'Hidden')).toBe(true);

    expect(viewFor(room, 't1').state?.pendingShadyPress).toBeNull(); // everyone else, including the target
  });

  it("reveals Manipulate's peek only to whoever used it", () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [playerStub('p0', 'A'), playerStub('p1', 'B')],
      pendingManipulate: { playerId: 'p1', cards: [card('secret')], phase: 'KEEP' },
    };
    const room = startedRoomWithState(state);

    expect(viewFor(room, 't1').state?.pendingManipulate?.cards).toHaveLength(1); // the user (seat 1)
    expect(viewFor(room, 't0').state?.pendingManipulate).toBeNull(); // everyone else
  });

  it('hands back no state at all — not even unredacted — for a token this room does not recognize', () => {
    const base = emptyGameState();
    const state: GameState = {
      ...base,
      players: [
        { ...playerStub('p0', 'A'), hand: [card('a1')] },
        { ...playerStub('p1', 'B'), hand: [card('b1')] },
      ],
    };
    const room = startedRoomWithState(state);

    const view = viewFor(room, 'unknown-token');
    expect(view.yourSeat).toBe(-1);
    expect(view.state).toBeNull();
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
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(leaveRoom(started, 't1').players).toHaveLength(4);
  });

  it('can empty a room (caller then deletes it)', () => {
    let room = createRoom({ code: 'ABCD', hostToken: 't0', hostName: 'Solo', now: 0 });
    room = leaveRoom(room, 't0');
    expect(room.players).toHaveLength(0);
  });
});

describe('kickPlayer', () => {
  it('removes the targeted seat and re-seats the rest contiguously', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']); // Ava is the host (seat 0, t0)
    const after = kickPlayer(room, { hostToken: 't0', targetSeat: 1 }); // Ben (seat 1) removed

    expect(after.players).toHaveLength(3);
    expect(after.players.map((p) => p.name)).toEqual(['Ava', 'Cara', 'Dev']);
    expect(after.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(after.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
  });

  it('refuses a non-host caller', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(() => kickPlayer(room, { hostToken: 't1', targetSeat: 2 })).toThrow(/host/);
  });

  it('refuses to remove the host themselves', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(() => kickPlayer(room, { hostToken: 't0', targetSeat: 0 })).toThrow(/cannot remove themselves/);
  });

  it('refuses an unknown seat', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(() => kickPlayer(room, { hostToken: 't0', targetSeat: 9 })).toThrow(/no player/i);
  });

  it('refuses once the game has started', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(() => kickPlayer(started, { hostToken: 't0', targetSeat: 1 })).toThrow(/game has started/);
  });
});

describe('rejoinRoom', () => {
  it('reissues a token for the seat matching the given name', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    const after = rejoinRoom(started, 'new-token', 'Ben');

    const ben = after.players.find((p) => p.name === 'Ben');
    expect(ben?.token).toBe('new-token');
    expect(ben?.seat).toBe(1); // unchanged — rejoin never re-seats anyone
    expect(after.players).toHaveLength(4);
  });

  it('matches case-insensitively and trims whitespace', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    const after = rejoinRoom(started, 'new-token', '  ben  ');
    expect(after.players.find((p) => p.name === 'Ben')?.token).toBe('new-token');
  });

  it("the old token stops working once someone rejoins Ben's seat", () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    const after = rejoinRoom(started, 'new-token', 'Ben');
    expect(after.players.some((p) => p.token === 't1')).toBe(false); // Ben's original token
  });

  it('refuses before the game has started', () => {
    const room = roomWith(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(() => rejoinRoom(room, 'x', 'Ben')).toThrow(/has not started/);
  });

  it('refuses a blank name', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(() => rejoinRoom(started, 'x', '   ')).toThrow(/enter the name/i);
  });

  it('refuses a name that matches no seat', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(() => rejoinRoom(started, 'x', 'Zed')).toThrow(/no player/i);
  });

  it('refuses an ambiguous name shared by more than one seat', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Ben', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(() => rejoinRoom(started, 'x', 'Ben')).toThrow(/more than one player/i);
  });
});

describe('playAgain', () => {
  function finishedRoom(): Room {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    return { ...started, state: { ...started.state!, winner: 'CIVILIAN' } };
  }

  it('refuses while the game is still in progress', () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    expect(() => playAgain(started, 't0', 'Ava')).toThrow(/still in progress/);
  });

  it('refuses a token that was never part of the finished game', () => {
    const room = finishedRoom();
    expect(() => playAgain(room, 'stranger', 'Zed')).toThrow(/not part of this game/i);
  });

  it('the first caller opens a rematch lobby with just themselves as host, without touching the finished game', () => {
    const room = finishedRoom();
    const after = playAgain(room, 't2', 'Cara'); // Cara (seat 2), not the original host

    // The finished game itself is untouched — teammates who haven't clicked
    // "Play again" yet must keep seeing it exactly as before.
    expect(after.code).toBe(room.code);
    expect(after.started).toBe(true);
    expect(after.state).toBe(room.state);
    expect(after.players).toEqual(room.players);

    expect(after.rematch?.started).toBe(false);
    expect(after.rematch?.state).toBeNull();
    expect(after.rematch?.players).toEqual([{ seat: 0, id: 'p0', name: 'Cara', token: 't2' }]);
    expect(isHost(after.rematch!, 't2')).toBe(true); // first to click becomes host, regardless of their old seat
    expect(after.rematch?.chatEnabled).toBe(false); // fresh — the new host picks again
    expect(after.rematch?.chat).toEqual([]);
  });

  it('a second caller joins the same rematch lobby as a normal seat, not a new one', () => {
    const room = finishedRoom();
    const afterFirst = playAgain(room, 't2', 'Cara');
    const afterSecond = playAgain(afterFirst, 't0', 'Ava'); // the original host, joining second

    expect(afterSecond.rematch?.players.map((p) => p.name)).toEqual(['Cara', 'Ava']);
    expect(isHost(afterSecond.rematch!, 't2')).toBe(true); // Cara stays host
    expect(isHost(afterSecond.rematch!, 't0')).toBe(false); // Ava did not reclaim host by being original seat 0
    // Still untouched — Ava joining the rematch doesn't affect the finished game.
    expect(afterSecond.started).toBe(true);
    expect(afterSecond.players).toEqual(room.players);
  });

  it('is idempotent for the same caller clicking twice', () => {
    const room = finishedRoom();
    const afterFirst = playAgain(room, 't2', 'Cara');
    const afterAgain = playAgain(afterFirst, 't2', 'Cara');
    expect(afterAgain.rematch?.players).toHaveLength(1);
  });

  it('refuses a stranger who was never part of the finished game, even once a rematch lobby exists', () => {
    const room = finishedRoom();
    const afterFirst = playAgain(room, 't2', 'Cara');
    // Unlike a normal room code (anyone can join), a rematch is for the group
    // that was actually just playing — the finished game's own players list
    // is the source of truth for who's allowed in, and it never changes.
    expect(() => playAgain(afterFirst, 'new-guy', 'Zed')).toThrow(/not part of this game/i);
  });
});

describe('rematch lobby (playAgain + viewFor + startRoom/kick/chat/leave)', () => {
  function finishedRoom(): Room {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev']), { token: 't0', newGame, now: 0 });
    return { ...started, state: { ...started.state!, winner: 'CIVILIAN' } };
  }

  it("keeps showing the finished game to a player who hasn't clicked Play again yet — no false removal", () => {
    const room = finishedRoom();
    const afterCara = playAgain(room, 't2', 'Cara'); // Cara opens the rematch lobby

    // Ava (t0) never clicked anything — her view must be exactly as if
    // nothing happened: still seated, still seeing the finished game.
    const avaView = viewFor(afterCara, 't0');
    expect(avaView.started).toBe(true);
    expect(avaView.yourSeat).toBe(0);
    expect(avaView.winner).toBe('CIVILIAN');
    expect(avaView.state).not.toBeNull();
  });

  it('shows the rematch lobby, not the finished game, to a player who has joined it', () => {
    const room = finishedRoom();
    const afterBoth = playAgain(playAgain(room, 't2', 'Cara'), 't1', 'Ben');

    const benView = viewFor(afterBoth, 't1');
    expect(benView.started).toBe(false);
    expect(benView.winner).toBeNull();
    expect(benView.isHost).toBe(false); // Cara got there first
    expect(benView.seats.map((s) => s.name)).toEqual(['Cara', 'Ben']);

    const caraView = viewFor(afterBoth, 't2');
    expect(caraView.isHost).toBe(true);
  });

  it("the rematch host's Start Game promotes the lobby into the room's own fields", () => {
    const room = finishedRoom();
    const withLobby = playAgain(
      playAgain(playAgain(playAgain(room, 't2', 'Cara'), 't1', 'Ben'), 't3', 'Dev'),
      't0',
      'Ava',
    );
    const promoted = startRoom(withLobby, { token: 't2', newGame, now: 0 }); // Cara, the lobby host

    expect(promoted.code).toBe(room.code);
    expect(promoted.started).toBe(true);
    expect(promoted.state).not.toBeNull();
    expect(promoted.state?.winner).toBeNull();
    expect(promoted.players.map((p) => p.name)).toEqual(['Cara', 'Ben', 'Dev', 'Ava']);
    expect(promoted.rematch).toBeNull();
  });

  it("leaves out a player who never joined the rematch, once it's started", () => {
    const started = startRoom(roomWith(['Ava', 'Ben', 'Cara', 'Dev', 'Eli']), { token: 't0', newGame, now: 0 });
    const room: Room = { ...started, state: { ...started.state!, winner: 'CIVILIAN' } };
    // Everyone but Ava (t0) rejoins for the rematch — still enough for MIN_PLAYERS.
    const withLobby = playAgain(
      playAgain(playAgain(playAgain(room, 't2', 'Cara'), 't1', 'Ben'), 't3', 'Dev'),
      't4',
      'Eli',
    );
    const promoted = startRoom(withLobby, { token: 't2', newGame, now: 0 });

    expect(viewFor(promoted, 't0').yourSeat).toBe(-1);
  });

  it("the rematch host can kick a lobby member without touching the finished game's own players", () => {
    const room = finishedRoom();
    const withLobby = playAgain(playAgain(room, 't2', 'Cara'), 't1', 'Ben');
    const afterKick = kickPlayer(withLobby, { hostToken: 't2', targetSeat: 1 }); // Cara kicks Ben

    expect(afterKick.rematch?.players.map((p) => p.name)).toEqual(['Cara']);
    expect(afterKick.players).toEqual(room.players); // finished game untouched
  });

  it('the rematch host can toggle chat for the lobby without touching the finished game', () => {
    const room = finishedRoom();
    const withLobby = playAgain(room, 't2', 'Cara');
    const afterToggle = setChatEnabled(withLobby, { hostToken: 't2', enabled: true });

    expect(afterToggle.rematch?.chatEnabled).toBe(true);
    expect(afterToggle.chatEnabled).toBe(room.chatEnabled);
  });

  it('a lobby member can leave the rematch without affecting the finished game', () => {
    const room = finishedRoom();
    const withLobby = playAgain(playAgain(room, 't2', 'Cara'), 't1', 'Ben');
    const afterLeave = leaveRoom(withLobby, 't1'); // Ben backs out of the rematch

    expect(afterLeave.rematch?.players.map((p) => p.name)).toEqual(['Cara']);
    expect(afterLeave.players).toEqual(room.players); // finished game untouched
  });
});

// --- small stubs ---
import type { ActionCard } from '../types/cards.js';
import type { Player, RoleIdentity } from '../types/game.js';

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
