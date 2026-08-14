/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnyCard } from '../types/cards.js';
import { cardArtUrl, roleArtUrl } from './cardArt.js';
import { ROLES } from './roles.js';
import {
  ACTION_CARD_DEFS,
  MARKET_PERKS,
  MARKET_WEAPONS,
  BLACK_MARKET_PERKS,
  BLACK_MARKET_WEAPONS,
  EXPAND_NETWORK,
} from './cards.js';

const PUBLIC = join(process.cwd(), 'public');

/** Map a served URL ("/cards/x.png") to its file path under public/. */
function filePath(url: string): string {
  return join(PUBLIC, url.replace(/^\/+/, ''));
}

const deckCards: AnyCard[] = ACTION_CARD_DEFS.map((d) => ({ name: d.name }) as AnyCard);
const marketCards: AnyCard[] = [
  ...MARKET_PERKS,
  ...MARKET_WEAPONS,
  ...BLACK_MARKET_PERKS,
  ...BLACK_MARKET_WEAPONS,
  EXPAND_NETWORK,
].map((d) => ({ name: d.name, cost: d.cost }) as AnyCard);
const allCards = [...deckCards, ...marketCards];

/** Every art file that actually exists on disk, as served URLs. */
function existingArtUrls(): string[] {
  const urls: string[] = [];
  for (const dir of ['deck', 'market', 'roles']) {
    const abs = join(PUBLIC, 'cards', dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.png')) urls.push(`/cards/${dir}/${f}`);
    }
  }
  return urls;
}

describe('card/role art integrity', () => {
  it('every card that claims art has a file on disk (no broken images)', () => {
    const missing = allCards
      .map((c) => cardArtUrl(c))
      .filter((u): u is string => Boolean(u))
      .filter((u) => !existsSync(filePath(u)));
    expect(missing).toEqual([]);
  });

  it('every role that claims art has a file on disk', () => {
    const missing = ROLES.map((r) => roleArtUrl(r.id))
      .filter((u): u is string => Boolean(u))
      .filter((u) => !existsSync(filePath(u)));
    expect(missing).toEqual([]);
  });

  it('no art file is orphaned (every file is referenced by a card or role)', () => {
    const referenced = new Set<string>([
      ...allCards.map((c) => cardArtUrl(c)).filter((u): u is string => Boolean(u)),
      ...ROLES.map((r) => roleArtUrl(r.id)).filter((u): u is string => Boolean(u)),
    ]);
    const orphans = existingArtUrls().filter((u) => !referenced.has(u));
    expect(orphans).toEqual([]);
  });

  it('every role has a role mat (full art coverage for roles)', () => {
    const withoutArt = ROLES.filter((r) => !roleArtUrl(r.id)).map((r) => r.id);
    expect(withoutArt).toEqual([]);
  });

  it('card faces are not truncated/landscape crops', () => {
    // Deck faces are portrait (~0.7 wide:tall) and market faces are square
    // (318×318). A strongly landscape image means a bad crop like the old
    // forensic-files.png (531×179 ≈ 0.34). Flag anything much wider than tall.
    // Role mats are exempt — they are legitimately landscape play mats.
    const MIN_ASPECT = 0.8; // height / width
    const badlyCropped = allCards
      .map((c) => cardArtUrl(c))
      .filter((u): u is string => Boolean(u))
      .filter((u) => {
        const { width, height } = pngSize(filePath(u));
        return height / width < MIN_ASPECT;
      });
    expect(badlyCropped).toEqual([]);
  });
});

/** Read a PNG's dimensions straight from the IHDR chunk (no deps). */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // PNG signature is 8 bytes; IHDR width/height are the next big-endian uint32s at 16/20.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
