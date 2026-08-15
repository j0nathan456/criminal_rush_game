import { describe, it, expect } from 'vitest';
import { getSeatPositions } from './tableLayout.js';

const COUNTS = [4, 5, 6, 7, 8];

describe('getSeatPositions', () => {
  it('returns one position per player for every supported count', () => {
    for (const n of COUNTS) {
      expect(getSeatPositions(n, 0)).toHaveLength(n);
    }
  });

  it('pins the viewer to the bottom-centre regardless of their index', () => {
    for (const n of COUNTS) {
      for (let viewer = 0; viewer < n; viewer++) {
        const seats = getSeatPositions(n, viewer);
        const self = seats[viewer];
        expect(self.isViewer).toBe(true);
        // Bottom-centre: x ≈ 50, y is the maximum (lowest on screen).
        expect(self.xPct).toBeCloseTo(50, 5);
        const maxY = Math.max(...seats.map((s) => s.yPct));
        expect(self.yPct).toBeCloseTo(maxY, 5);
      }
    }
  });

  it('flags exactly the two seats adjacent to the viewer as neighbours', () => {
    for (const n of COUNTS) {
      for (let viewer = 0; viewer < n; viewer++) {
        const seats = getSeatPositions(n, viewer);
        const neighborIdx = seats.flatMap((s, i) => (s.isNeighbor ? [i] : []));
        expect(neighborIdx).toHaveLength(2);
        // Must match the engine's neighbour definition: (viewer ± 1) mod n.
        const expected = [(viewer - 1 + n) % n, (viewer + 1) % n].sort((a, b) => a - b);
        expect([...neighborIdx].sort((a, b) => a - b)).toEqual(expected);
        expect(seats[viewer].isNeighbor).toBe(false);
      }
    }
  });

  it('keeps every coordinate finite and within the 0–100 container bounds', () => {
    for (const n of COUNTS) {
      for (const seat of getSeatPositions(n, 0)) {
        expect(Number.isFinite(seat.xPct)).toBe(true);
        expect(Number.isFinite(seat.yPct)).toBe(true);
        expect(seat.xPct).toBeGreaterThanOrEqual(0);
        expect(seat.xPct).toBeLessThanOrEqual(100);
        expect(seat.yPct).toBeGreaterThanOrEqual(0);
        expect(seat.yPct).toBeLessThanOrEqual(100);
      }
    }
  });
});
