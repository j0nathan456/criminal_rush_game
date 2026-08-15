/**
 * Seat geometry for the spatial "players around a table" layout.
 *
 * Pure presentation config — it maps a player's index in the `players` array
 * to a position on an ellipse, with the local viewer pinned to bottom-centre.
 * Seats keep `players`-array order around the ring, so the two seats flanking
 * the viewer are exactly the viewer's engine neighbours (see `neighborIds` in
 * `src/engine/rules.ts`) — hence `isNeighbor` needs no engine import.
 */

/** Horizontal radius of the seat ring, as a percentage of the container. */
const RADIUS_X = 44;
/** Vertical radius of the seat ring, as a percentage of the container. */
const RADIUS_Y = 42;

export interface SeatPosition {
  /** Horizontal centre of the seat, 0–100 (% of the table container width). */
  xPct: number;
  /** Vertical centre of the seat, 0–100 (% of the table container height). */
  yPct: number;
  /** True for the local player's seat (pinned to bottom-centre). */
  isViewer: boolean;
  /** True for the two seats immediately left/right of the viewer. */
  isNeighbor: boolean;
}

/**
 * Positions for every player, indexed to match `state.players`.
 *
 * The viewer sits at bottom-centre; remaining players are spread evenly
 * clockwise around the ellipse in seat order, so adjacency reads visually.
 */
export function getSeatPositions(playerCount: number, viewerIndex: number): SeatPosition[] {
  const n = playerCount;
  const positions: SeatPosition[] = [];

  for (let i = 0; i < n; i++) {
    // slot 0 = viewer (bottom), then 1..n-1 spread clockwise around the ring.
    const slot = (i - viewerIndex + n) % n;
    // Screen coords have y pointing down, so +90° places the viewer at the bottom.
    const theta = ((90 + (slot * 360) / n) * Math.PI) / 180;

    positions.push({
      xPct: 50 + RADIUS_X * Math.cos(theta),
      yPct: 50 + RADIUS_Y * Math.sin(theta),
      isViewer: slot === 0,
      // slot 1 and slot n-1 are the seats on either side of the viewer.
      isNeighbor: n > 1 && (slot === 1 || slot === n - 1),
    });
  }

  return positions;
}
