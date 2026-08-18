/**
 * src/types/cards.ts
 */

export type Team = 'CRIMINAL' | 'CIVILIAN';

export type EvidenceCategory = 'TIME' | 'MEANS' | 'LOCATION' | 'MOTIVE';

export type ActionCardType = 'MONEY' | 'EVIDENCE' | 'POWER' | 'EVENT'

export type MarketCardType =
  | 'PERK'
  | 'WEAPON'
  | 'SPECIAL';

/** Weapon damage class — drives type-conditional combat bonuses. */
export type WeaponType = 'MELEE' | 'RANGED' | 'TECH' | 'CHEMICAL';

/**
 * ACTION CARDS
 * Found in the main Draw Pile. 
 * These are free to play from the hand.
 */
export interface ActionCard {
  id: string;
  name: string;
  description: string;
  type: ActionCardType;
  
  /**
   * Only applicable if type is 'EVIDENCE'.
   * A single card can potentially satisfy multiple categories.
   */
  evidenceCategories?: EvidenceCategory[];

  /** Only for type 'MONEY': how many dollars playing this card grants. */
  value?: number;

  /** Only for type 'POWER': base power level this card adds during combat. */
  power?: number;
}

/**
 * MARKET CARDS (Perks & Weapons)
 * Found in the Public Market or Black Market. 
 * Must be purchased with money.
 */
export interface MarketCard {
  id: string;
  name: string;
  description: string;
  cost: number;
  source: 'PUBLIC' | 'BLACK_MARKET'; 
  type: MarketCardType;
  
  /**
   * If present, purchasing this card immediately adds 
   * points to the team's victory point total.
   * Example: 'Expand Network'
   */
  vpValue?: number;

  /**
   * Optional flag for cards that provide permanent passive bonuses
   */
  isPassive?: boolean;

  /** Only for type 'WEAPON': its damage class. */
  weaponType?: WeaponType;

  /** Only for type 'WEAPON': base power level it contributes in combat. */
  power?: number;

  /**
   * Set when the Smuggler moved this card from the Market into the Black
   * Market. It's an extra offer on top of the Black Market's usual 3-card
   * rotation, not a member of it: buying it never triggers a replacement
   * draw, and it doesn't count toward the threshold that decides whether the
   * *other* Black Market cards need one (see refillMarkets in reducer.ts).
   */
  smuggled?: boolean;
}

/**
 * Union type for any card in the game 
 * (Useful for lists like a discard pile that might contain both)
 */
export type AnyCard = ActionCard | MarketCard;