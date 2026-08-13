/**
 * src/online/protocol.ts
 *
 * Shared types for online play. Used by the pure room logic, the serverless
 * API handlers, and the client — so it must stay free of Node/React/KV imports.
 */

import type { GameState, Team } from '../types/game';

/** A seat in a room. `token` is a secret held only server-side. */
export interface RoomPlayer {
  seat: number;
  /** Engine player id, always `p${seat}` so it aligns with createGame. */
  id: string;
  name: string;
  token: string;
}

/** Authoritative room record stored in the backend (Redis). */
export interface Room {
  code: string;
  createdAt: number;
  started: boolean;
  players: RoomPlayer[];
  /** Null until the host starts; then the full authoritative game state. */
  state: GameState | null;
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
  isHost: boolean;
  state: GameState | null;
  winner: Team | null;
}
