/**
 * src/engine/deck.ts
 *
 * Pure deck utilities. The engine never imports card *data* from `constants`;
 * callers pass card definitions in. Randomness is injectable so shuffles are
 * deterministic under test.
 */

/** A source of randomness in [0, 1). Defaults to Math.random in production. */
export type Rng = () => number;

/** A card definition: a card without its per-instance id, plus a copy count. */
export type Definition<T> = Omit<T, 'id'> & { copies: number };

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 * Deterministic when given a seeded `rng`.
 */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Expand `{ copies: n, ...card }` definitions into individual cards, each with
 * a unique id of the form `${prefix}-${index}`.
 */
export function expandDefs<T extends { id: string }>(
  defs: readonly Definition<T>[],
  prefix: string,
): T[] {
  const cards: T[] = [];
  let n = 0;
  for (const def of defs) {
    const { copies, ...rest } = def;
    for (let c = 0; c < copies; c++) {
      cards.push({ ...rest, id: `${prefix}-${n++}` } as unknown as T);
    }
  }
  return cards;
}

/**
 * Build and shuffle the draw pile from action-card definitions.
 */
export function buildDrawPile<T extends { id: string }>(
  defs: readonly Definition<T>[],
  rng: Rng = Math.random,
): T[] {
  return shuffle(expandDefs(defs, 'ac'), rng);
}

/**
 * Deal `count` cards off the top of a pile. Returns the dealt cards and the
 * remaining pile (no mutation).
 */
export function deal<T>(pile: readonly T[], count: number): { dealt: T[]; rest: T[] } {
  return { dealt: pile.slice(0, count), rest: pile.slice(count) };
}
