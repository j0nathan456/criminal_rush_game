import { describe, it, expect } from 'vitest';
import { determineWinner } from './scoring.js';

describe('determineWinner', () => {
  const targets = { CIVILIAN: 4, CRIMINAL: 5 };

  it('returns null when neither team has reached its target', () => {
    expect(determineWinner({ CIVILIAN: 3, CRIMINAL: 4 }, targets)).toBeNull();
  });

  it('declares CIVILIAN the winner at target', () => {
    expect(determineWinner({ CIVILIAN: 4, CRIMINAL: 2 }, targets)).toBe('CIVILIAN');
  });

  it('declares CRIMINAL the winner at target', () => {
    expect(determineWinner({ CIVILIAN: 1, CRIMINAL: 5 }, targets)).toBe('CRIMINAL');
  });

  it('breaks a simultaneous tie in favor of CIVILIAN', () => {
    expect(determineWinner({ CIVILIAN: 4, CRIMINAL: 5 }, targets)).toBe('CIVILIAN');
  });

  it('keeps an existing winner when no target is reached', () => {
    expect(determineWinner({ CIVILIAN: 1, CRIMINAL: 1 }, targets, 'CRIMINAL')).toBe('CRIMINAL');
  });
});
