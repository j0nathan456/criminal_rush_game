/**
 * src/constants/theme.ts
 *
 * The "constants" architectural area: static definitions for every UI element.
 * These describe how game entities *look* (colors, labels, icons) — no game
 * logic and no engine imports. The `setup` layer maps engine state onto these
 * so components can render without knowing the rules.
 */

import type { Team, EvidenceCategory, ActionCardType, MarketCardType } from '../types/cards.js';
import type { PlayerActionType } from '../types/game.js';

/** Team identity colors. Civilians are the blue detectives, Criminals the red syndicate. */
export const TEAM_META: Record<Team, { label: string; color: string; soft: string; icon: string }> = {
  CIVILIAN: { label: 'Civilians', color: '#2b6cff', soft: 'rgba(43, 108, 255, 0.14)', icon: '🕵️' },
  CRIMINAL: { label: 'Criminals', color: '#e03b3b', soft: 'rgba(224, 59, 59, 0.14)', icon: '🎭' },
};

/** The four Evidence Grid categories, in display order. */
export const EVIDENCE_ORDER: EvidenceCategory[] = ['TIME', 'MEANS', 'LOCATION', 'MOTIVE'];

export const CATEGORY_META: Record<EvidenceCategory, { label: string; color: string; icon: string }> = {
  TIME: { label: 'Time', color: '#8b5cf6', icon: '🕰️' },
  MEANS: { label: 'Means', color: '#0ea5e9', icon: '🔗' },
  LOCATION: { label: 'Location', color: '#10b981', icon: '📍' },
  MOTIVE: { label: 'Motive', color: '#f59e0b', icon: '⚡' },
};

/** Visual treatment for each action-card type found in the draw pile. */
export const CARD_TYPE_META: Record<ActionCardType, { label: string; color: string; icon: string }> = {
  MONEY: { label: 'Money', color: '#16a34a', icon: '💵' },
  EVIDENCE: { label: 'Evidence', color: '#8b5cf6', icon: '🔍' },
  POWER: { label: 'Power', color: '#ef4444', icon: '💥' },
  EVENT: { label: 'Event', color: '#0284c7', icon: '📣' },
};

/** Visual treatment for market cards (perks, weapons, and specials like Expand Network). */
export const MARKET_TYPE_META: Record<MarketCardType, { label: string; color: string; icon: string }> = {
  PERK: { label: 'Perk', color: '#65a30d', icon: '🧰' },
  WEAPON: { label: 'Weapon', color: '#b45309', icon: '⚔️' },
  SPECIAL: { label: 'Special', color: '#7c3aed', icon: '🌐' },
};

/** Player status badges. Keys line up with boolean flags on the Player type. */
export const STATUS_META = {
  isInjured: { label: 'Injured', color: '#f59e0b', icon: '🤕' },
  isExposed: { label: 'Exposed', color: '#dc2626', icon: '🚨' },
  isCaptured: { label: 'Captured', color: '#6b7280', icon: '🔒' },
} as const;

/**
 * Temporary token badges tracked on the Player type. Unlike STATUS_META these
 * are counters/one-shots (virus stacks, a pending coffee, a traffic jam) rather
 * than long-lived status, so they render as a separate set.
 */
export const TOKEN_META = {
  virus: { label: 'Virus', color: '#7c3aed', icon: '🦠', hint: 'Costs an action at the start of your next turn.' },
  traffic: { label: 'Traffic', color: '#f97316', icon: '🚧', hint: 'Trading with this player costs 2 actions until cleared.' },
  coffee: { label: 'Coffee', color: '#b45309', icon: '☕', hint: '+1 action and a draw at the start of your next turn.' },
} as const;

/**
 * The turn's 8 action choices (rulebook §3), each mapped to the engine action
 * it dispatches, its AP cost, and whether it is limited to once per turn.
 * The ActionBar renders straight from this list.
 */
export interface ActionMeta {
  type: PlayerActionType;
  label: string;
  icon: string;
  cost: number;
  oncePerTurn?: boolean;
  /** Only shown for this team, when set. */
  team?: Team;
  hint: string;
}

export const TURN_ACTIONS: ActionMeta[] = [
  { type: 'DRAW_CARD', label: 'Draw', icon: '🂠', cost: 1, hint: 'Draw a card from the top of the deck.' },
  { type: 'PLAY_CARD', label: 'Play Card', icon: '🎴', cost: 1, hint: 'Play a card from your hand.' },
  { type: 'PURCHASE_MARKET', label: 'Buy', icon: '🛒', cost: 1, oncePerTurn: true, hint: 'Purchase a perk or weapon. Once per turn.' },
  { type: 'SELL_ITEM', label: 'Sell', icon: '🏷️', cost: 1, hint: 'Discard a perk or weapon for $1.' },
  { type: 'ROLE_ABILITY', label: 'Role Action', icon: '✨', cost: 1, oncePerTurn: true, hint: 'Use your role or perk action. Once per turn.' },
  { type: 'TRADE', label: 'Trade', icon: '🤝', cost: 1, hint: 'Trade a card, weapon, or $1 with a teammate.' },
  { type: 'SPECIAL_GOAL', label: 'Expose', icon: '🚨', cost: 1, team: 'CIVILIAN', hint: 'Spend a full Evidence grid to Expose a Criminal.' },
  { type: 'SPECIAL_GOAL', label: 'Expand Network', icon: '🌐', cost: 1, team: 'CRIMINAL', hint: 'Buy an Expand Network card to gain 1 VP.' },
  { type: 'COMBAT', label: 'Combat', icon: '⚔️', cost: 2, oncePerTurn: true, hint: 'Attack a neighbor. Costs 2 actions.' },
];

/** Actions granted per turn (before perks/roles modify it). */
export const BASE_ACTIONS_PER_TURN = 3;

/** Inventory slot caps (rulebook §4): a player may hold 4 perks and 2 weapons. */
export const MAX_PERKS = 4;
export const MAX_WEAPONS = 2;
