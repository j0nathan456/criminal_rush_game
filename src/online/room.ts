/**
 * src/online/room.ts
 *
 * Pure room lifecycle logic for online play. No Redis, no HTTP, no React — the
 * game engine (reducer / newGame) is injected, so this is fully unit-testable.
 * The serverless handlers are thin wrappers that load a room, call one of these
 * functions, and save the result.
 */

import type { GameState, Player } from '../types/game.js';
import type { ActionCard } from '../types/cards.js';
import type { GameAction } from '../engine/index.js';
import type { Room, RoomView } from './protocol.js';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

/** Unambiguous code alphabet (no O/0/I/1). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Generate a join code (default 4 chars). Deterministic under a seeded rng. */
export function generateCode(rng: () => number = Math.random, length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

export interface CreateRoomInput {
  code: string;
  hostToken: string;
  hostName: string;
  now: number;
}

/** Create a fresh, un-started room with the host in seat 0. */
export function createRoom({ code, hostToken, hostName, now }: CreateRoomInput): Room {
  return {
    code,
    createdAt: now,
    started: false,
    players: [{ seat: 0, id: 'p0', name: hostName, token: hostToken }],
    state: null,
  };
}

/** Add a player to a not-yet-started room. Throws on invalid joins. */
export function joinRoom(room: Room, token: string, name: string): Room {
  if (room.started) throw new RoomError('Game already started.');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError('Room is full.');
  if (room.players.some((p) => p.token === token)) return room; // idempotent re-join
  const seat = room.players.length;
  return {
    ...room,
    players: [...room.players, { seat, id: `p${seat}`, name: name.trim() || `Player ${seat + 1}`, token }],
  };
}

/**
 * Recover a lost session in an already-started room: match an existing seat
 * by player name and hand it a fresh token, so a client that lost its
 * original one (cleared storage, a new device, hit "Leave" by accident) can
 * get back into the game it's already seated in. The old token simply stops
 * working — whichever client presents a name match first reclaims the seat.
 *
 * Name matching is exact (trimmed, case-insensitive) and refuses rather than
 * guesses when it's ambiguous. This is deliberately not real authentication —
 * "know the right name" is the whole check, which is fine for a casual game
 * among people who trust each other but not a defense against a stranger
 * guessing another player's name.
 */
export function rejoinRoom(room: Room, token: string, name: string): Room {
  if (!room.started) throw new RoomError('This game has not started yet — join it instead.');
  const trimmed = name.trim();
  if (!trimmed) throw new RoomError('Enter the name you originally joined with.');
  const matches = room.players.filter((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (matches.length === 0) throw new RoomError('No player with that name in this game.');
  if (matches.length > 1) throw new RoomError('More than one player has that name — ask the table to sort it out.');
  const seat = matches[0].seat;
  return {
    ...room,
    players: room.players.map((p) => (p.seat === seat ? { ...p, token } : p)),
  };
}

/**
 * Remove a player from a not-yet-started room and re-seat everyone so seats and
 * ids stay contiguous (`p0..pN`). No-op once the game has started (mid-game
 * abandonment is out of scope — the seat is kept). Returns the updated room;
 * callers should delete the room if `players` ends up empty.
 */
export function leaveRoom(room: Room, token: string): Room {
  if (room.started) return room;
  const remaining = room.players.filter((p) => p.token !== token);
  if (remaining.length === room.players.length) return room; // not in room
  return {
    ...room,
    players: remaining.map((p, seat) => ({ ...p, seat, id: `p${seat}` })),
  };
}

export interface KickPlayerInput {
  hostToken: string;
  /** The seat (as shown in the lobby) of the player to remove. */
  targetSeat: number;
}

/**
 * Host-only: remove another player from a not-yet-started room, re-seating
 * everyone so seats and ids stay contiguous (`p0..pN`), same as leaveRoom.
 * Unlike leaveRoom (which quietly no-ops for a token that isn't even in the
 * room), this throws on any invalid request — it's an explicit privileged
 * action, so a bad request should surface rather than fail silently.
 */
export function kickPlayer(room: Room, { hostToken, targetSeat }: KickPlayerInput): Room {
  if (room.started) throw new RoomError('Cannot remove a player once the game has started.');
  if (!isHost(room, hostToken)) throw new RoomError('Only the host can remove a player.');
  if (targetSeat === 0) throw new RoomError('The host cannot remove themselves.');
  if (!room.players.some((p) => p.seat === targetSeat)) throw new RoomError('No player in that seat.');
  return {
    ...room,
    players: room.players.filter((p) => p.seat !== targetSeat).map((p, seat) => ({ ...p, seat, id: `p${seat}` })),
  };
}

export interface StartRoomInput {
  token: string;
  newGame: (playerNames: string[]) => GameState;
}

/** Host-only: start the game once at least MIN_PLAYERS have joined. */
export function startRoom(room: Room, { token, newGame }: StartRoomInput): Room {
  if (room.started) throw new RoomError('Game already started.');
  if (!isHost(room, token)) throw new RoomError('Only the host can start the game.');
  if (room.players.length < MIN_PLAYERS) {
    throw new RoomError(`Need at least ${MIN_PLAYERS} players to start.`);
  }
  const names = [...room.players].sort((a, b) => a.seat - b.seat).map((p) => p.name);
  return { ...room, started: true, state: newGame(names) };
}

export interface ApplyActionInput {
  token: string;
  action: GameAction;
  reducer: (state: GameState, action: GameAction) => GameState;
}

/**
 * Combat-phase actions may be submitted by players other than the one whose
 * turn it is (the defender and teammates play Power cards). The engine's
 * reducer remains the authority on whether each is legal.
 */
const COMBAT_PHASE_ACTIONS = new Set(['PLAY_POWER', 'COMBAT_DISCARD_MONEY']);

/**
 * Apply an engine action. Normal actions require it to be the requester's turn;
 * combat-phase actions are allowed from any room member (the reducer validates
 * them). Several actions are each one specific player's decision, not "any
 * room member" or "whoever's turn it nominally is":
 *  - COMBAT_CHOICE (Portal/Drones/Mutants/Pistol/Nurse's Triage/Leaving Evidence) belongs to
 *    `combat.pending[0].playerId`, often the defender.
 *  - PASS_COMBAT belongs to whichever combatant `action.side` names — a
 *    player may only pass their own side, never their opponent's.
 *  - RESOLVE_THREATEN belongs to `pendingThreaten.targetId` — the Arsonist's
 *    victim, not the Arsonist (whose turn it nominally still is).
 *  - RESOLVE_TRADE_RETURN belongs to `pendingTrade.recipientId` — the
 *    teammate who owes a return gift, not the trade's initiator.
 *  - RESOLVE_BODYGUARD_SETUP belongs to `pendingBodyguardSetup.bodyguardId`
 *    — the Bodyguard isn't necessarily the starting (current) player.
 * Returns the room unchanged if the game is already over.
 */
export function applyAction(room: Room, { token, action, reducer }: ApplyActionInput): Room {
  if (!room.started || !room.state) throw new RoomError('Game has not started.');
  const me = room.players.find((p) => p.token === token);
  if (!me) throw new RoomError('You are not in this room.');
  if (room.state.winner) return room; // game over — ignore

  if (action.type === 'COMBAT_CHOICE') {
    const decider = room.state.combat?.pending[0]?.playerId;
    if (!decider || me.id !== decider) throw new RoomError('It is not your combat choice to make.');
  } else if (action.type === 'PASS_COMBAT') {
    const combat = room.state.combat;
    const combatantId = action.side === 'ATTACKER' ? combat?.attacker.playerId : combat?.defender.playerId;
    if (!combatantId || me.id !== combatantId) throw new RoomError('You can only pass for yourself.');
  } else if (action.type === 'RESOLVE_THREATEN') {
    const targetId = room.state.pendingThreaten?.targetId;
    if (!targetId || me.id !== targetId) throw new RoomError('It is not your Threaten choice to make.');
  } else if (action.type === 'RESOLVE_TRADE_RETURN') {
    const recipientId = room.state.pendingTrade?.recipientId;
    if (!recipientId || me.id !== recipientId) throw new RoomError('It is not your trade to respond to.');
  } else if (action.type === 'RESOLVE_BODYGUARD_SETUP') {
    const bodyguardId = room.state.pendingBodyguardSetup?.bodyguardId;
    if (!bodyguardId || me.id !== bodyguardId) throw new RoomError('It is not your Bodyguard choice to make.');
  } else if (!COMBAT_PHASE_ACTIONS.has(action.type)) {
    const currentId = room.state.players[room.state.currentPlayerIndex]?.id;
    if (me.id !== currentId) throw new RoomError('It is not your turn.');
  }

  return { ...room, state: reducer(room.state, action) };
}

/** True if the token belongs to the host (seat 0). */
export function isHost(room: Room, token: string): boolean {
  return room.players[0]?.token === token;
}

/**
 * Build the redacted view a given player is allowed to see:
 *  - other players' hands → face-down placeholders (count preserved),
 *  - the draw pile → face-down placeholders (count preserved),
 *  - the Spy's peek → included only for its owner.
 * The discard pile and everything else is public.
 */
export function viewFor(room: Room, token: string): RoomView {
  const me = room.players.find((p) => p.token === token);
  const yourSeat = me ? me.seat : -1;
  const state = me && room.state ? redactState(room.state, me.id) : room.state;

  return {
    code: room.code,
    started: room.started,
    seats: room.players.map((p) => ({ seat: p.seat, name: p.name })),
    yourSeat,
    isHost: isHost(room, token),
    state,
    winner: room.state?.winner ?? null,
  };
}

function hiddenCards(count: number, tag: string): ActionCard[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    id: `hidden-${tag}-${i}`,
    name: 'Hidden',
    description: '',
    type: 'MONEY' as const,
  }));
}

function redactState(state: GameState, viewerId: string): GameState {
  const players: Player[] = state.players.map((p) =>
    p.id === viewerId ? p : { ...p, hand: hiddenCards(p.hand.length, p.id) },
  );

  return {
    ...state,
    players,
    // The draw pile is face-down for everyone.
    drawPile: hiddenCards(state.drawPile.length, 'draw'),
    // The Spy's peek is private to the Spy.
    lastPeek: state.lastPeek && state.lastPeek.playerId === viewerId ? state.lastPeek : null,
    // The Sheriff's subpoena reveal is private to the Sheriff — the target's
    // hand is otherwise hidden above, so this is the only way they see it.
    pendingSheriff:
      state.pendingSheriff && state.pendingSheriff.sheriffId === viewerId ? state.pendingSheriff : null,
    // Manipulate's reveal is private to whoever used it — the draw pile is
    // otherwise hidden above, so this is the only way they see it.
    pendingManipulate:
      state.pendingManipulate && state.pendingManipulate.playerId === viewerId ? state.pendingManipulate : null,
    // Gain Influence's burn offer references a card still sitting in the
    // actor's own (otherwise-hidden) hand — private to them, like the above.
    pendingEvidenceBurn:
      state.pendingEvidenceBurn && state.pendingEvidenceBurn.playerId === viewerId ? state.pendingEvidenceBurn : null,
  };
}

/** A validation/authorization error the API can map to a 4xx response. */
export class RoomError extends Error {}
