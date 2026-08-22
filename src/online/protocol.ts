/**
 * src/online/protocol.ts
 *
 * Shared types for online play. Used by the pure room logic, the serverless
 * API handlers, and the client — so it must stay free of Node/React/KV imports.
 */

import type { GameState, Team } from '../types/game.js';

/** A seat in a room. `token` is a secret held only server-side. */
export interface RoomPlayer {
  seat: number;
  /**
   * Engine player id, always `p${seat}`. This lobby `seat` (join order) is
   * stable identity, not turn order — createGame shuffles turn order (and
   * team) independently, so `state.players` may list this id at any index.
   */
  id: string;
  name: string;
  token: string;
}

/** A single chat message, as stored and broadcast to every room member. */
export interface ChatMessage {
  id: string;
  seat: number;
  name: string;
  team: Team;
  text: string;
  sentAt: number;
}

/** Authoritative room record stored in the backend (Redis). */
export interface Room {
  code: string;
  createdAt: number;
  started: boolean;
  players: RoomPlayer[];
  /** Null until the host starts; then the full authoritative game state. */
  state: GameState | null;
  /** Host-only setting, toggled pre-game (see setChatEnabled). */
  chatEnabled: boolean;
  /** Public to every room member — no redaction needed. */
  chat: ChatMessage[];
}

/** Public seat info (no tokens). */
export interface LobbySeat {
  seat: number;
  name: string;
}

/**
 * What a specific player receives. The `state` is redacted for that player:
 * other players' hands and the draw pile are reduced to counts, and the Spy's
 * peek is only included for its owner.
 */
export interface RoomView {
  code: string;
  started: boolean;
  seats: LobbySeat[];
  /** The requesting player's seat, or -1 if their token is unknown. */
  yourSeat: number;
  /**
   * The requesting player's index into `state.players`, or -1 if their token
   * is unknown or the game hasn't started. `yourSeat` is lobby join order and
   * is NOT this index — createGame reorders `state.players` into turn order,
   * so use this field (not `yourSeat`) whenever indexing into `state.players`.
   */
  yourPlayerIndex: number;
  isHost: boolean;
  state: GameState | null;
  winner: Team | null;
  chatEnabled: boolean;
  chat: ChatMessage[];
}
