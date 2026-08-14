import { describe, it, expect } from 'vitest';
import type { ActionCard } from '../types/cards.js';
import { shuffle, expandDefs, buildDrawPile, deal } from './deck.js';
import { ACTION_CARD_DEFS } from '../constants/cards.js';

/** Deterministic PRNG (mulberry32) so shuffle tests are reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('shuffle', () => {
  it('is a permutation and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(1));
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(42))).toEqual(shuffle([1, 2, 3, 4, 5], seeded(42)));
  });
});

describe('expandDefs', () => {
  it('expands copy counts into uniquely-id\'d cards', () => {
    const defs = [
      { name: 'A', description: '', type: 'MONEY', value: 1, copies: 2 },
      { name: 'B', description: '', type: 'MONEY', value: 2, copies: 1 },
    ] as (Omit<ActionCard, 'id'> & { copies: number })[];

    const cards = expandDefs<ActionCard>(defs, 'ac');
    expect(cards.map((c) => c.name)).toEqual(['A', 'A', 'B']);
    expect(cards.map((c) => c.id)).toEqual(['ac-0', 'ac-1', 'ac-2']);
    expect(cards[0]).not.toHaveProperty('copies');
  });
});

describe('buildDrawPile', () => {
  it('produces the full 80-card action deck', () => {
    expect(buildDrawPile(ACTION_CARD_DEFS, seeded(7))).toHaveLength(80);
  });
});

describe('deal', () => {
  it('splits the top N cards off a pile without mutation', () => {
    const pile = ['a', 'b', 'c', 'd'];
    const { dealt, rest } = deal(pile, 2);
    expect(dealt).toEqual(['a', 'b']);
    expect(rest).toEqual(['c', 'd']);
    expect(pile).toHaveLength(4);
  });
});
