/**
 * src/constants/cardArt.ts
 *
 * Maps game cards and roles to their printed art, extracted from the source
 * PDFs in `/art` and committed as PNGs under `public/cards/`. Pure UI data —
 * no game logic, no engine imports. The `setup`/components layer calls these
 * helpers to decide whether to render the full-face art or fall back to the
 * CSS card.
 *
 * Not every card has art (e.g. themed Evidence cards, a few Market weapons).
 * The helpers return `undefined` when there is no matching image so the caller
 * can render the plain CSS card instead.
 */

import type { AnyCard } from '../types/cards.js';

/** Vite serves `public/` at the app base; BASE_URL always ends in a slash. */
const BASE = `${import.meta.env.BASE_URL ?? '/'}cards`;

/**
 * Slugify a card/role name the same way the extraction script did:
 * lowercase, drop apostrophes/periods, collapse the rest into single dashes.
 */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Catalog names whose printed art carries a different name. Keyed by the
 * slug of the catalog card name, valued by the art file's slug.
 */
const NAME_ALIASES: Record<string, string> = {
  'ally-support': 'ally-power', // event art is titled "Ally Power"
  'coffee-machine': 'coffee',
  'alarm-clock': 'alarm',
  mosquitos: 'mosquito',
};

/** Role ids (from constants/roles.ts) that have a role-mat image. */
const ROLE_ART = new Set([
  'mayor', 'attorney', 'collector', 'sheriff', 'vigilante', 'nurse', 'bodyguard',
  'witness', 'crime-lord', 'hitman', 'spy', 'evil-scientist', 'robber', 'arsonist',
  'smuggler', 'forger',
]);

/** Draw-pile (action) card art available under public/cards/deck. */
const DECK_ART = new Set([
  'spring-cleaning', 'traffic-jam', 'market-exchange', 'gain-influence', 'ally-power',
  'lottery', 'business-opportunity', 'tax-collection', 'generational-wealth',
  'receive-package', 'market-access', 'boost', 'surge', 'shield', 'unexpected-allies',
  'mirror', 'spare-change', 'profit', 'collection', 'forensic-files',
]);

/** Market (perk/weapon/special) card art available under public/cards/market. */
const MARKET_ART = new Set([
  'alarm', 'arrows', 'axe', 'bank', 'barbed-wire', 'bat', 'brass-knuckles', 'bribery',
  'cannon', 'catapult', 'coffee', 'computer', 'corrosion-cannisters', 'corrupt-connections',
  'credit-card', 'disguise', 'drones', 'electric-baton', 'expand-network', 'express-shipping',
  'getaway-car', 'hammer', 'harpoon', 'investment', 'ironworks', 'journal', 'laboratory',
  'machine-gun', 'mafia-alliance', 'magnetic-deflector', 'manipulate', 'missile',
  'molotov-cocktail', 'mosquito', 'mutants', 'nerve-agents', 'parasites', 'pistol',
  'pocket-knife', 'portal', 'radio', 'recycling-bin', 'robot-soldier', 'shady-press',
  'switch-blade', 'toxic-gas', 'trash-can', 'viruses', 'vitamin', 'water-bottle',
]);

function resolve(name: string): string {
  const s = slug(name);
  return NAME_ALIASES[s] ?? s;
}

/** Full-face art URL for a role's play mat, or undefined if none exists. */
export function roleArtUrl(roleId: string): string | undefined {
  return ROLE_ART.has(roleId) ? `${BASE}/roles/${roleId}.png` : undefined;
}

/** Full-face art URL for a draw-pile or market card, or undefined if none. */
export function cardArtUrl(card: AnyCard): string | undefined {
  const s = resolve(card.name);
  if ('cost' in card) {
    return MARKET_ART.has(s) ? `${BASE}/market/${s}.png` : undefined;
  }
  return DECK_ART.has(s) ? `${BASE}/deck/${s}.png` : undefined;
}
