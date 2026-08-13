/**
 * src/mocks/mockGame.ts
 *
 * A hand-authored GameState fixture used to develop and preview the UI in
 * isolation. This is NOT engine code — once the engine's useGameState() is
 * ready, the `setup` layer feeds real state to the board and this fixture is
 * only used for component previews / tests.
 */

import type { GameState, Player, RoleIdentity } from '../types/game';
import type { ActionCard, MarketCard } from '../types/cards';

const ROLE: Record<string, RoleIdentity> = {
  mayor: {
    id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2,
    abilityName: 'City Hall', abilityDescription: 'Has +1 action per turn.',
  },
  attorney: {
    id: 'attorney', name: 'Attorney', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Retainer', abilityDescription: 'Whenever a teammate plays an Evidence card into the grid, collect $1.',
  },
  crimeLord: {
    id: 'crime-lord', name: 'Crime Lord', team: 'CRIMINAL', powerlevel: 4,
    abilityName: 'Connections', abilityDescription: 'Action: Purchase Expand Network for $1 less.',
  },
  hitman: {
    id: 'hitman', name: 'Hitman', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Marksman', abilityDescription: 'Each weapon you have has +1 PL when attacking.',
  },
};

const hand: ActionCard[] = [
  { id: 'c1', name: 'Profit', description: 'Gain $2.', type: 'MONEY' },
  { id: 'c2', name: 'Forensic Files', description: 'Wild evidence — satisfies any category.', type: 'EVIDENCE', evidenceCategories: ['TIME', 'MEANS', 'LOCATION', 'MOTIVE'] },
  { id: 'c3', name: 'Metal Chain', description: 'Physical evidence linking the crime.', type: 'EVIDENCE', evidenceCategories: ['MEANS'] },
  { id: 'c4', name: 'Boost', description: '+1 PL during combat.', type: 'POWER' },
  { id: 'c5', name: 'Tax Collection', description: 'Force a player to give you $1.', type: 'EVENT' },
];

const market: MarketCard[] = [
  { id: 'm1', name: 'Computer', description: 'At the start of your turn, draw a card.', cost: 2, source: 'PUBLIC', type: 'PERK', isPassive: true },
  { id: 'm2', name: 'Bank', description: 'Action: Play a money card for +$1 value and draw a card.', cost: 3, source: 'PUBLIC', type: 'PERK' },
  { id: 'm3', name: 'Hammer', description: '+2 power. Before combat, draw a card.', cost: 4, source: 'PUBLIC', type: 'WEAPON' },
  { id: 'm4', name: 'Bat', description: '+2 power.', cost: 3, source: 'PUBLIC', type: 'WEAPON' },
  { id: 'm5', name: 'Express Shipping', description: 'After you trade, gain $1 or draw 1 card.', cost: 2, source: 'PUBLIC', type: 'PERK' },
];

const blackMarket: MarketCard[] = [
  { id: 'b1', name: 'Getaway Car', description: 'Initiating combat only costs 1 action.', cost: 3, source: 'BLACK_MARKET', type: 'PERK' },
  { id: 'b2', name: 'Mafia Alliance', description: 'All Power cards you play are worth +1 power.', cost: 2, source: 'BLACK_MARKET', type: 'PERK' },
  { id: 'b3', name: 'Expand Network', description: 'Gain 1 VP when acquired. Cannot be sold or traded.', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 },
];

function player(over: Partial<Player> & Pick<Player, 'id' | 'name' | 'role'>): Player {
  return {
    hand: [],
    inventory: [],
    money: 2,
    actionsRemaining: 3,
    hasPurchasedFromMarket: false,
    hasUsedRoleAbility: false,
    powerLevel: over.role.powerlevel,
    isInjured: false,
    isExposed: false,
    isCaptured: false,
    team: over.role.team,
    ...over,
  };
}

export const MOCK_GAME: GameState = {
  players: [
    player({ id: 'p0', name: 'Ava', role: ROLE.mayor, hand, money: 3, actionsRemaining: 3 }),
    player({ id: 'p1', name: 'Ben', role: ROLE.crimeLord, money: 5, actionsRemaining: 3, inventory: [blackMarket[0]] }),
    player({ id: 'p2', name: 'Cara', role: ROLE.attorney, money: 2, actionsRemaining: 3, isInjured: true }),
    player({ id: 'p3', name: 'Dev', role: ROLE.hitman, money: 4, actionsRemaining: 3, inventory: [market[2]] }),
  ],
  currentPlayerIndex: 0,
  drawPile: [],
  discardPile: [],
  publicMarket: market,
  blackMarket,
  evidenceGrid: {
    TIME: { isFilled: true, cardName: 'Forensic Files' },
    MEANS: { isFilled: true, cardName: 'Metal Chain' },
    LOCATION: { isFilled: false, cardName: null },
    MOTIVE: { isFilled: false, cardName: null },
  },
  teamScores: { CIVILIAN: 2, CRIMINAL: 3 },
  vpTargets: { CIVILIAN: 4, CRIMINAL: 5 },
  gameLog: [
    'The Rush begins!',
    'Ben (Crime Lord) purchased a Getaway Car.',
    'Cara was attacked and is now injured.',
    "Ava's turn — 3 actions remaining.",
  ],
  winner: null,
};
