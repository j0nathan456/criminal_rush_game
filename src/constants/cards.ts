/**
 * src/constants/cards.ts
 *
 * The full card catalog, transcribed from the rule book appendix (p.11-16).
 * Pure data — no logic, no engine imports. Cards are described as *definitions*
 * with a `copies` count; the engine expands them into individual, id'd cards.
 *
 * The `constants` layer owns this data; the `engine` receives it as a parameter
 * (engine never imports constants).
 */

import type { ActionCard, MarketCard } from '../types/cards.js';

/** A card definition: the card minus its per-instance id, plus how many exist. */
export type CardDef<T> = Omit<T, 'id'> & { copies: number };

// ---------------------------------------------------------------------------
// DRAW DECK (80 cards): Money 21 + Evidence 21 + Power 16 + Event 22
// ---------------------------------------------------------------------------

export const MONEY_CARDS: CardDef<ActionCard>[] = [
  { name: 'Spare Change', description: 'Gain $1.', type: 'MONEY', value: 1, copies: 5 },
  { name: 'Profit', description: 'Gain $2.', type: 'MONEY', value: 2, copies: 11 },
  { name: 'Collection', description: 'Gain $3.', type: 'MONEY', value: 3, copies: 5 },
];

// The 21 Evidence cards match the printed deck (art in public/cards/deck).
// Each themed card is unique (copies: 1) except the wild Forensic Files (×3).
export const EVIDENCE_CARDS: CardDef<ActionCard>[] = [
  // Time (3)
  { name: 'Sunrise', description: 'Evidence — Time.', type: 'EVIDENCE', evidenceCategories: ['TIME'], copies: 1 },
  { name: 'Evening', description: 'Evidence — Time.', type: 'EVIDENCE', evidenceCategories: ['TIME'], copies: 1 },
  { name: 'Eclipse', description: 'Evidence — Time.', type: 'EVIDENCE', evidenceCategories: ['TIME'], copies: 1 },
  // Location (3)
  { name: 'College Campus', description: 'Evidence — Location.', type: 'EVIDENCE', evidenceCategories: ['LOCATION'], copies: 1 },
  { name: 'Grocery Store', description: 'Evidence — Location.', type: 'EVIDENCE', evidenceCategories: ['LOCATION'], copies: 1 },
  { name: 'Movie Theater', description: 'Evidence — Location.', type: 'EVIDENCE', evidenceCategories: ['LOCATION'], copies: 1 },
  // Means (3)
  { name: 'Bullet Shell', description: 'Evidence — Means.', type: 'EVIDENCE', evidenceCategories: ['MEANS'], copies: 1 },
  { name: 'Metal Chain', description: 'Evidence — Means.', type: 'EVIDENCE', evidenceCategories: ['MEANS'], copies: 1 },
  { name: 'Bomb Fragment', description: 'Evidence — Means.', type: 'EVIDENCE', evidenceCategories: ['MEANS'], copies: 1 },
  // Motive (3)
  { name: 'Greed', description: 'Evidence — Motive.', type: 'EVIDENCE', evidenceCategories: ['MOTIVE'], copies: 1 },
  { name: 'Power', description: 'Evidence — Motive.', type: 'EVIDENCE', evidenceCategories: ['MOTIVE'], copies: 1 },
  { name: 'Envy', description: 'Evidence — Motive.', type: 'EVIDENCE', evidenceCategories: ['MOTIVE'], copies: 1 },
  // Wild (3)
  { name: 'Forensic Files', description: 'Wild evidence — satisfies any one category.', type: 'EVIDENCE', evidenceCategories: ['TIME', 'MEANS', 'LOCATION', 'MOTIVE'], copies: 3 },
  // Dual-category (6)
  { name: 'Lunch Cafeteria', description: 'Evidence — Time or Location.', type: 'EVIDENCE', evidenceCategories: ['TIME', 'LOCATION'], copies: 1 },
  { name: 'Poisoned Morning Coffee', description: 'Evidence — Time or Means.', type: 'EVIDENCE', evidenceCategories: ['TIME', 'MEANS'], copies: 1 },
  { name: 'Post Scandal Cover Up', description: 'Evidence — Time or Motive.', type: 'EVIDENCE', evidenceCategories: ['TIME', 'MOTIVE'], copies: 1 },
  { name: 'Construction Site Bricks', description: 'Evidence — Location or Means.', type: 'EVIDENCE', evidenceCategories: ['LOCATION', 'MEANS'], copies: 1 },
  { name: 'Casino Heist', description: 'Evidence — Location or Motive.', type: 'EVIDENCE', evidenceCategories: ['LOCATION', 'MOTIVE'], copies: 1 },
  { name: 'Bare-Knuckle Fury', description: 'Evidence — Means or Motive.', type: 'EVIDENCE', evidenceCategories: ['MEANS', 'MOTIVE'], copies: 1 },
];

export const POWER_CARDS: CardDef<ActionCard>[] = [
  { name: 'Boost', description: '+1 PL during combat.', type: 'POWER', power: 1, copies: 7 },
  { name: 'Surge', description: '+2 PL during combat.', type: 'POWER', power: 2, copies: 3 },
  { name: 'Shield', description: '+3 PL. Can only be played on defense.', type: 'POWER', power: 3, copies: 2 },
  { name: 'Unexpected Allies', description: '+2 PL. Can only be played for a teammate.', type: 'POWER', power: 2, copies: 3 },
  { name: 'Mirror', description: "Copies the PL of another player's Power card played earlier this combat.", type: 'POWER', power: 0, copies: 1 },
];

export const EVENT_CARDS: CardDef<ActionCard>[] = [
  { name: 'Receive Package', description: 'Draw 3 cards.', type: 'EVENT', copies: 2 },
  { name: 'Market Access', description: 'Purchase a perk/weapon from the Market for a $1 discount.', type: 'EVENT', copies: 2 },
  { name: 'Tax Collection', description: 'Force a player to give you $1.', type: 'EVENT', copies: 2 },
  { name: 'Gain Influence', description: 'Randomly take a card from a chosen player. If Evidence, you may play it (or burn it as a Criminal).', type: 'EVENT', copies: 2 },
  { name: 'Market Exchange', description: 'Give or take a perk with a teammate. Then draw a card.', type: 'EVENT', copies: 2 },
  { name: 'Ally Support', description: 'Copy a role or perk action of a teammate.', type: 'EVENT', copies: 2 },
  { name: 'Business Opportunity', description: 'Sell a perk or weapon for its cost + $1 back.', type: 'EVENT', copies: 2 },
  { name: 'Lottery', description: 'Reveal top 3 cards. Play any Money cards, discard the rest.', type: 'EVENT', copies: 2 },
  { name: 'Spring Cleaning', description: 'Discard 3 Market cards and replace them, then buy 1 perk at a $1 discount.', type: 'EVENT', copies: 2 },
  { name: 'Generational Wealth', description: 'You and your teammates each get $1.', type: 'EVENT', copies: 2 },
  { name: 'Traffic Jam', description: 'Give an opponent a Traffic token (trading with them costs 2 actions).', type: 'EVENT', copies: 2 },
];

/** Everything that goes into the shuffled draw pile. */
export const ACTION_CARD_DEFS: CardDef<ActionCard>[] = [
  ...MONEY_CARDS,
  ...EVIDENCE_CARDS,
  ...POWER_CARDS,
  ...EVENT_CARDS,
];

// ---------------------------------------------------------------------------
// PUBLIC MARKET
// ---------------------------------------------------------------------------

export const MARKET_PERKS: CardDef<MarketCard>[] = [
  { name: 'Alarm Clock', description: 'Action: play an Event card, then draw 1 card and gain $1.', cost: 3, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Radio', description: 'You may trade for one less action, once per turn.', cost: 2, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Recycling Bin', description: 'Action: discard a card to take one of the same type from the discard, then gain $1 or draw 1.', cost: 2, source: 'PUBLIC', type: 'PERK', copies: 1 },
  { name: 'Journal', description: 'After playing an Event card, discard this to repeat the effect.', cost: 1, source: 'PUBLIC', type: 'PERK', copies: 1 },
  { name: 'Express Shipping', description: 'After you trade during your turn, gain $1 or draw 1 card.', cost: 2, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Water Bottle', description: 'Discard this for an extra action.', cost: 1, source: 'PUBLIC', type: 'PERK', copies: 1 },
  { name: 'Credit Card', description: 'Action: buy from the Market at $1 off, or discard this for a $2 discount.', cost: 2, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Investment', description: 'Start of turn: gain $1. Cannot be sold.', cost: 2, source: 'PUBLIC', type: 'PERK', isPassive: true, copies: 2 },
  { name: 'Computer', description: 'Start of turn: draw a card.', cost: 2, source: 'PUBLIC', type: 'PERK', isPassive: true, copies: 2 },
  { name: 'Bank', description: 'Action: play a Money card for +$1 value and draw a card.', cost: 3, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Coffee Machine', description: 'Give a Coffee token; Action: replenish/move it. Coffee: +1 action & draw at start of turn.', cost: 3, source: 'PUBLIC', type: 'PERK', copies: 2 },
  { name: 'Vitamin', description: 'Start of turn: advance the vitamin tracker (draw / $1 / +1 PL / +1 PL).', cost: 3, source: 'PUBLIC', type: 'PERK', isPassive: true, copies: 2 },
  { name: 'Trash Can', description: 'Start of turn: bin a Market card. Action: buy from the trash can at $1 off.', cost: 2, source: 'PUBLIC', type: 'PERK', copies: 1 },
];

export const MARKET_WEAPONS: CardDef<MarketCard>[] = [
  { name: 'Bat', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2, copies: 2 },
  { name: 'Pocket Knife', description: '+1 power for each perk and weapon you have (including this).', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 0, copies: 2 },
  { name: 'Switch Blade', description: '+2 power, +2 more if your opponent has a Chemical weapon.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2, copies: 2 },
  { name: 'Hammer', description: '+2 power. Before combat, draw a card.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2, copies: 2 },
  { name: 'Axe', description: '+5 power.', cost: 5, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 5, copies: 2 },
  { name: 'Arrows', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 2, copies: 2 },
  { name: 'Pistol', description: '+4 power. Before combat, discard a card (if possible).', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 4, copies: 2 },
  { name: 'Harpoon', description: '+2 power, +2 more if your opponent has a Melee weapon.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 2, copies: 2 },
  { name: 'Catapult', description: '+2 power (+3 in 4-player games). May attack non-neighbors.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 2, copies: 2 },
  { name: 'Machine Gun', description: '+3 power. Power phase: discard Money cards for +1 power each. May attack non-neighbors.', cost: 5, source: 'PUBLIC', type: 'WEAPON', weaponType: 'RANGED', power: 3, copies: 2 },
  { name: 'Electric Baton', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 2, copies: 2 },
  { name: 'Missile', description: '+2 power. If you win with this, destroy one of the opponent’s perks.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 2, copies: 2 },
  { name: 'Magnetic Deflector', description: '+2 power, +2 more if your opponent has a Ranged weapon.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 2, copies: 2 },
  { name: 'Signal Jammer', description: '+2 power. Your opponent may not play Power cards.', cost: 5, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 2, copies: 2 },
  { name: 'Robot Soldier', description: '+1 power for every card you hold, max +5.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'TECH', power: 0, copies: 2 },
  { name: 'Toxic Gas', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 2, copies: 2 },
  { name: 'Viruses', description: '+2 power. After combat, give your opponent a Virus token (-1 action).', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 2, copies: 2 },
  { name: 'Corrosion Cannisters', description: '+2 power, +2 more if your opponent has a Tech weapon.', cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 2, copies: 2 },
  { name: 'Parasites', description: "Power equal to your opponent's role base PL.", cost: 4, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 0, copies: 2 },
  { name: 'Mosquitos', description: '+3 power. Before combat, randomly make your opponent discard a card.', cost: 5, source: 'PUBLIC', type: 'WEAPON', weaponType: 'CHEMICAL', power: 3, copies: 2 },
];

// ---------------------------------------------------------------------------
// BLACK MARKET (Criminals only)
// ---------------------------------------------------------------------------

export const BLACK_MARKET_PERKS: CardDef<MarketCard>[] = [
  { name: 'Hacked Passwords', description: 'Action: randomly steal a card from a chosen player.', cost: 3, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Mafia Alliance', description: 'All Power cards you play are worth +1 power.', cost: 2, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Getaway Car', description: 'Initiating combat costs only 1 action. Start of turn: may pass this + a card to a teammate.', cost: 3, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Manipulate', description: 'Action: look at the top 3 cards; take 1, discard 1, put 1 back on top.', cost: 2, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Bribery', description: 'When sold, pay $1 to a Civilian to discard 1 Evidence card from the grid.', cost: 1, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Laboratory', description: 'Start of turn: draw a card. Your Chemical/Tech weapons are +1 PL.', cost: 3, source: 'BLACK_MARKET', type: 'PERK', isPassive: true, copies: 1 },
  { name: 'Ironworks', description: 'Start of turn: gain $1. Your Melee/Ranged weapons are +1 PL.', cost: 3, source: 'BLACK_MARKET', type: 'PERK', isPassive: true, copies: 1 },
  { name: 'Shady Press', description: 'Action: view a player’s Event cards and play one immediately.', cost: 2, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
  { name: 'Corrupt Connections', description: 'Start of turn: gain an extra action this turn.', cost: 3, source: 'BLACK_MARKET', type: 'PERK', isPassive: true, copies: 1 },
  { name: 'Disguise', description: 'On purchase, draw 2 cards. Cannot be Exposed while held. Start of turn: discard it.', cost: 1, source: 'BLACK_MARKET', type: 'PERK', copies: 1 },
];

export const BLACK_MARKET_WEAPONS: CardDef<MarketCard>[] = [
  { name: 'Barbed Wire', description: '+1 power. Before combat, your opponent discards 1 card (if possible).', cost: 2, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'MELEE', power: 1, copies: 1 },
  { name: 'Brass Knuckles', description: '+1 power. When attacking, steal $1 from your opponent (if possible).', cost: 2, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'MELEE', power: 1, copies: 1 },
  { name: 'Molotov Cocktail', description: "+2 power. After combat, destroy one of the opponent's perks.", cost: 3, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'RANGED', power: 2, copies: 1 },
  { name: 'Cannon', description: '+1 power per card your opponent holds, max +4.', cost: 3, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'RANGED', power: 0, copies: 1 },
  { name: 'Portal', description: "Before combat, draw 2 cards or pay $1 to swap this with a teammate's weapon.", cost: 3, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'TECH', power: 0, copies: 1 },
  { name: 'Drones', description: '+2 power. Before combat, may exchange a card with a teammate.', cost: 3, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'TECH', power: 2, copies: 1 },
  { name: 'Nerve Agents', description: '+1 power. Attacks against you cost 1 extra action.', cost: 2, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'CHEMICAL', power: 1, copies: 1 },
  { name: 'Mutants', description: "+1 power. Copies the effect of one of your opponent's weapons.", cost: 3, source: 'BLACK_MARKET', type: 'WEAPON', weaponType: 'CHEMICAL', power: 1, copies: 1 },
];

/**
 * Expand Network — the Criminals' VP engine. Priced $5 and rising; sits in the
 * Black Market alongside 3 rotating cards. Grants 1 VP on purchase.
 */
export const EXPAND_NETWORK: CardDef<MarketCard> = {
  name: 'Expand Network', description: 'Gain 1 VP when acquired. Cannot be sold or traded. Costs $1 more for captured Criminals.',
  cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1, copies: 4,
};

export const MARKET_CATALOG = {
  publicPerks: MARKET_PERKS,
  publicWeapons: MARKET_WEAPONS,
  blackPerks: BLACK_MARKET_PERKS,
  blackWeapons: BLACK_MARKET_WEAPONS,
  expandNetwork: EXPAND_NETWORK,
};
