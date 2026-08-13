import type { ActionCard, MarketCard, EvidenceCategory } from './cards';

export type Team = 'CRIMINAL' | 'CIVILIAN';

// Specific Role Identity (e.g., "The Sniper", "The Detective")
export interface RoleIdentity {
  id: string;
  name: string;
  team: Team;
  powerlevel: number;
  abilityName: string;
  abilityDescription: string;
}

export interface Player {
  id: string;
  name: string;
  team: Team;
  role: RoleIdentity; // The specific character assigned to the player
  hand: ActionCard[];       // Cards drawn from Draw Deck
  inventory: MarketCard[];  // Items/Perks bought from Markets
  money: number;
  
  // Turn State
  actionsRemaining: number;
  hasPurchasedFromMarket: boolean;
  hasUsedRoleAbility: boolean;
  
  // Status
  isInjured: boolean;  // Civilians
  isCaptured: boolean; // Criminals
  isConvicted: boolean; // For Criminals


}

export type PlayerActionType = 
  | 'DRAW_CARD'         // Draw 1 card from Action Deck (1 AP)
  | 'PLAY_CARD'         // Play 1 card from Hand (1 AP)
  | 'PURCHASE_MARKET'   // Buy Perk/Weapon (1 AP, Once per turn)
  | 'SELL_ITEM'         // Sell Perk/Weapon for Money (1 AP)
  | 'ROLE_ABILITY'      // Unique character power (1 AP, Once per turn)
  | 'TRADE'             // Give card/money to teammate (1 AP)
  | 'SPECIAL_GOAL'      // Civilians: Expose | Criminals: Expand Net (1 AP)
  | 'COMBAT'            // Attack a neighbor (2 AP)
  | 'PLAY_EVIDENCE'     // Add card to Evidence Grid (1 AP)
  | 'CONVICT';          // Civilians: Spend full grid to penalize Criminal (1 AP)


export interface EvidenceSlot {
  isFilled: boolean;
  cardName: string | null;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  
  // Card Pools
  drawPile: ActionCard[];
  discardPile: ActionCard[];
  
  publicMarket: MarketCard[];      // Available to everyone
  blackMarket: MarketCard[];       // Available to Criminals only

  // Evidence Grid

  evidenceGrid: Record<EvidenceCategory, EvidenceSlot>;
  
  // Scoring & Meta
  teamScores: Record<Team, number>;
  vpTargets: Record<Team, number>;
  gameLog: string[];
  winner: Team | null;
}