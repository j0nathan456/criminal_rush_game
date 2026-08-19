import type { ActionCard, ActionCardType, MarketCard, EvidenceCategory } from './cards.js';

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
  /** Combat is limited to once per turn. */
  hasAttacked?: boolean;
  /** Radio perk: the once-per-turn cheaper trade has been used. */
  hasUsedRadio?: boolean;
  /** Ids of perks whose Action has been used this turn (each is once-per-turn). */
  usedPerkIds?: string[];
  /** Vitamin tracker stage (0–4): advances each start of turn for its reward. */
  vitaminStage?: number;

  // Combat
  /** Current power level: role base PL adjusted by expose (-1) and perks. */
  powerLevel: number;

  // Status (rulebook: Civilians can be injured; Criminals can be exposed then captured)
  isInjured: boolean;   // Civilians: cannot use ability, attack, or be attacked until healed
  isExposed: boolean;   // Criminals: lost 1 PL, now attackable by Civilians
  isCaptured: boolean;  // Criminals: lost role ability permanently, cannot attack or be attacked

  // Role-ability bookkeeping
  /** Bodyguard's Protection: holder gains +2 PL when defending (rulebook p.17). */
  hasBodyguardToken?: boolean;
  /**
   * Vigilante's Vengeance: PL permanently gained from Criminal VPs so far.
   * Capped at 3 (the ability's "+3 max"). Only meaningful on a Vigilante.
   */
  vigilanteStacks?: number;
  /** Virus tokens (from the Viruses weapon): each costs −1 action next start-of-turn. */
  virusTokens?: number;
  /** Traffic token (Traffic Jam event): trading with this player costs 2 actions. */
  trafficToken?: boolean;
  /** Active Coffee token (Coffee Machine): +1 action and a draw next start of turn. */
  coffeeToken?: boolean;
}

// --- Combat ------------------------------------------------------------------

export type CombatSide = 'ATTACKER' | 'DEFENDER';

/** A Power card played during a combat's Power phase. */
export interface PlayedPowerCard {
  cardId: string;
  name: string;
  /** Player who played the card (may be a teammate of the combatant). */
  byPlayerId: string;
  /** Which combatant's total the card boosts. */
  side: CombatSide;
  /** Final power added to the side (includes Mafia Alliance / Mirror copy). */
  power: number;
  /** The card's own PL before Mafia Alliance — what Mirror copies. */
  basePower: number;
}

/** One combatant's live state during a fight. */
export interface CombatParticipant {
  playerId: string;
  /** Role PL + weapons + conditionals + perks + tokens, computed after pre-combat effects. */
  basePower: number;
  /** Sum of Power cards played on this side. */
  powerCardBonus: number;
  /** Whether this side has passed in the current pass cycle. */
  passed: boolean;
  /** False when the opposing combatant holds Signal Jammer. */
  canPlayPower: boolean;
  /** Extra power from a Mutants copy of an opponent weapon (folded into basePower). */
  copiedWeaponPower?: number;
  /** Name of the weapon a Mutants copy took its effect from, if any (e.g. a copied Signal Jammer still locks the opponent out of Power cards — see enterPowerPhase). */
  copiedWeaponName?: string;
}

/**
 * Combat phases:
 *  - PRE: interactive pre-combat weapon choices (Portal / Drones / Mutants / Pistol) are pending.
 *  - POWER: base powers set; both sides play/pass Power cards.
 *  - AFTER: post-combat choice pending (Nurse's Triage, then Leaving Evidence) before the fight closes.
 */
export type CombatPhase = 'PRE' | 'POWER' | 'AFTER';

/** An interactive decision a combatant must make before/after the Power phase. */
export type CombatChoice =
  | { kind: 'PORTAL'; playerId: string; weaponId: string; side: CombatSide }
  | { kind: 'DRONES'; playerId: string; weaponId: string; side: CombatSide }
  | { kind: 'DRONES_RETURN'; playerId: string; holderId: string; holderCardId: string; side: CombatSide }
  | { kind: 'MUTANTS'; playerId: string; weaponId: string; side: CombatSide }
  | { kind: 'PISTOL'; playerId: string; weaponId: string; side: CombatSide }
  | { kind: 'NURSE_HEAL'; playerId: string; injuredId: string; side: CombatSide }
  | { kind: 'LEAVING_EVIDENCE'; playerId: string; side: CombatSide }
  | { kind: 'DESTROY_PERK'; playerId: string; targetId: string; weaponName: 'Missile' | 'Molotov Cocktail'; side: CombatSide };

/** The decision a player submits for the current pending CombatChoice. */
export type CombatChoiceInput =
  | { kind: 'PORTAL'; mode: 'DRAW' }
  | { kind: 'PORTAL'; mode: 'SWAP'; teammateId: string; teammateWeaponId: string }
  | { kind: 'DRONES'; mode: 'SKIP' }
  | { kind: 'DRONES'; mode: 'EXCHANGE'; cardId: string; teammateId: string }
  | { kind: 'DRONES_RETURN'; cardId: string }
  | { kind: 'MUTANTS'; mode: 'SKIP' }
  | { kind: 'MUTANTS'; mode: 'COPY'; opponentWeaponId: string }
  | { kind: 'PISTOL'; cardId: string }
  | { kind: 'NURSE_HEAL'; mode: 'SKIP' }
  | { kind: 'NURSE_HEAL'; mode: 'HEAL'; cardId: string }
  | { kind: 'LEAVING_EVIDENCE'; evidenceIds: string[] }
  | { kind: 'DESTROY_PERK'; perkId: string };

/** The interactive combat sub-state machine. Null when no fight is in progress. */
export interface CombatState {
  attacker: CombatParticipant;
  defender: CombatParticipant;
  /** Whose turn it is to act in the Power phase (a hint; resolution is order-independent except Mirror). */
  turn: CombatSide;
  /** Ordered history of Power cards played this combat (Mirror reads this). */
  played: PlayedPowerCard[];
  /** Actions the attacker spent to initiate (2, adjusted by Getaway Car / Nerve Agents). */
  actionCost: number;
  /** Player count, for weapon effects like Catapult. */
  playerCount: number;
  /** Current combat phase. */
  phase: CombatPhase;
  /** Queue of pending interactive choices; the head is the active one. */
  pending: CombatChoice[];
}

export type PlayerActionType = 
  | 'DRAW_CARD'         // Draw 1 card from Action Deck (1 AP)
  | 'PLAY_CARD'         // Play 1 card from Hand (1 AP)
  | 'PURCHASE_MARKET'   // Buy Perk/Weapon (1 AP, Once per turn)
  | 'SELL_ITEM'         // Sell Perk/Weapon for Money (1 AP)
  | 'ROLE_ABILITY'      // Unique character power (1 AP, Once per turn)
  | 'PERK_ACTION'       // Use an actionable perk (Bank, Credit Card, etc.) (1 AP, Water Bottle free)
  | 'TRADE'             // Give card/money to teammate (1 AP)
  | 'SPECIAL_GOAL'      // Civilians: Expose | Criminals: Expand Net (1 AP)
  | 'COMBAT'            // Attack a neighbor (2 AP)
  | 'PLAY_EVIDENCE'     // Add card to Evidence Grid (1 AP)
  | 'CONVICT';          // Civilians: Spend full grid to penalize Criminal (1 AP)


/**
 * One Evidence Grid category. Cards accumulate here as Civilians play them —
 * more than one may pile up in the same category — and stay put until an
 * Expose spends exactly one from each category (the exposing Civilian's
 * choice when a category holds more than one; see resolveExpose).
 */
export interface EvidenceSlot {
  cards: ActionCard[];
}

/** Per-team starting resources (rulebook setup table, p.3). */
export interface RoleSetup {
  startingCards: number;
  startingMoney: number;
}

/** Player-count-specific configuration (rulebook setup table, p.3). */
export interface GameConfig {
  civilians: number;
  criminals: number;
  vpTargets: Record<Team, number>;
  civSetup: RoleSetup;
  crimSetup: RoleSetup;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  
  // Card Pools
  drawPile: ActionCard[];
  discardPile: ActionCard[];
  
  publicMarket: MarketCard[];      // Available to everyone (5 face-up)
  blackMarket: MarketCard[];       // Available to Criminals only (Expand Network + 3 face-up)

  /**
   * Face-down replenishment decks behind the face-up markets. When a face-up
   * card is bought, its slot is refilled from the top of the matching deck
   * (rulebook p.6). Optional so pre-seeded/legacy states default to empty.
   */
  publicMarketDeck?: MarketCard[];
  blackMarketDeck?: MarketCard[];
  /** Remaining Expand Network copies in rising-cost order ($5 → $8). */
  expandNetworkPile?: MarketCard[];
  /** Cards binned by the Trash Can perk, purchasable from it at a $1 discount. */
  trashPile?: MarketCard[];

  // Evidence Grid

  evidenceGrid: Record<EvidenceCategory, EvidenceSlot>;
  
  // Scoring & Meta
  teamScores: Record<Team, number>;
  vpTargets: Record<Team, number>;
  gameLog: string[];
  winner: Team | null;

  /** Interactive combat in progress, or null when no fight is happening. */
  combat?: CombatState | null;

  /**
   * The Spy's Recon: at all times, the true top card of the deck — recomputed
   * after every action (see withSpyPeek in reducer.ts), so it's never stale,
   * and only present while it's that Spy's own turn. A per-player view layer
   * (see redactState in online/room.ts) shows it privately to just that Spy;
   * the engine never writes card identities into the shared `gameLog`.
   */
  lastPeek?: { playerId: string; cards: ActionCard[] } | null;

  /**
   * Spring Cleaning's follow-up: after the Market is discarded-and-refilled,
   * the player may buy one (now-visible) Market card at a discount. The refill
   * draws are unknown ahead of the event, so this can't be bundled into the
   * same dispatch as the discard choice — it's offered as a separate pending
   * step, resolved via USE_MARKET_DISCOUNT/SKIP_MARKET_DISCOUNT and cleared at
   * end of turn if unused.
   */
  pendingMarketDiscount?: { playerId: string; amount: number } | null;

  /**
   * Arsonist's Threaten: the targeted Civilian owes a choice between losing $1
   * or discarding a card — their choice, not the Arsonist's. This blocks other
   * actions (like `combat`) until resolved via RESOLVE_THREATEN, since it's a
   * different player's decision than whoever's turn it nominally is.
   */
  pendingThreaten?: { targetId: string } | null;

  /**
   * Trade's second half (rulebook p.7): the initiator already gave one item;
   * this teammate now owes a return gift — their own choice, not the
   * initiator's. Blocks other actions until resolved via
   * RESOLVE_TRADE_RETURN, mirroring pendingThreaten/combat's pending choices.
   */
  pendingTrade?: { initiatorId: string; recipientId: string } | null;

  /**
   * Express Shipping's payout: once a Trade its owner initiated fully
   * resolves, they choose $1 or a card draw — never both, never automatic.
   * Always the current player (Express Shipping only pays out on your own
   * turn's Trade action), but modeled as a blocking pending choice like
   * pendingTrade/pendingThreaten for a consistent "resolve this pop-up first"
   * pattern rather than folding it silently into resolveTradeReturn.
   */
  pendingExpressShipping?: { playerId: string } | null;

  /**
   * Sheriff's Subpoena: after targeting an opponent, their Evidence cards are
   * revealed here — the Sheriff's own decision, not another player's, but the
   * revealed card identities must survive online redaction (see redactState
   * in online/room.ts, exempted like lastPeek) so the Sheriff can actually see
   * what to play. `cards` is a snapshot taken at reveal time (the target's
   * hand may keep changing); resolved via RESOLVE_SHERIFF.
   */
  pendingSheriff?: { sheriffId: string; targetId: string; cards: ActionCard[] } | null;

  /**
   * Manipulate's reveal: the top of the deck, taken off it the moment the
   * perk is used (like Lottery) so nothing else can draw into it mid-choice.
   * Two sequential decisions share this one record, distinguished by `phase`:
   * first which card to keep (into hand), then — once `cards` is down to the
   * remaining ones — which to put back on top of the deck (whatever's left
   * over is discarded). Must survive online redaction like lastPeek/
   * pendingSheriff, exempted the same way in redactState.
   */
  pendingManipulate?: { playerId: string; cards: ActionCard[]; phase: 'KEEP' | 'TOP' } | null;

  /**
   * Bodyguard's Protection at game start (rulebook p.17): with only one other
   * Civilian to choose from (4-player games) the token is assigned
   * automatically and this is never set. With a genuine choice (5+ players,
   * 2+ other Civilian teammates) it's the Bodyguard's own pick, blocking
   * every other action — including END_TURN — until resolved via
   * RESOLVE_BODYGUARD_SETUP, since the game can't meaningfully start before
   * it's answered.
   */
  pendingBodyguardSetup?: { bodyguardId: string } | null;

  /**
   * Journal's offer, live after any Event card resolves (see playCard):
   * discard it to repeat that same Event's effect, gathering a fresh
   * target/options if it needs one (rulebook: "discard this to repeat the
   * effect") — a repeated Gain Influence, for instance, may target a
   * different opponent than the original play, and a repeated Ally Support
   * may copy a different teammate's Action. `card` is a snapshot of the
   * played Event (it's already sitting in the discard pile by the time this
   * is set). Free to use — costs no action — but still blocks other actions
   * until answered via RESOLVE_JOURNAL, so the choice isn't missed.
   */
  pendingJournal?: { playerId: string; card: ActionCard } | null;

  /**
   * Gain Influence's free burn offer: set when the Evidence card it just took
   * lands in a Criminal's hand (rulebook: "you may... burn it as a
   * Criminal"). Free — costs no action — but still blocks other actions
   * until answered via RESOLVE_EVIDENCE_BURN. Not redacted like pendingJournal
   * (the card stays in the actor's own hand, not a public pile), so
   * redactState hides it from everyone but the actor, same as pendingSheriff.
   */
  pendingEvidenceBurn?: { playerId: string; cardId: string } | null;

  /**
   * Recycling Bin's two-step resolution, live after the chosen hand card has
   * already been discarded (see applyPerk): first TAKE offers a same-type
   * card from the discard to recover (or, with none available, just an
   * acknowledgement), then REWARD offers the card text's "$1 or draw 1"
   * choice — mirrors pendingManipulate's KEEP/TOP phase split.
   */
  pendingRecyclingBin?: {
    playerId: string;
    discardedCardId: string;
    discardedType: ActionCardType;
    phase: 'TAKE' | 'REWARD';
  } | null;
}