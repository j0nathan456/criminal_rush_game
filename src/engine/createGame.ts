/**
 * src/engine/createGame.ts
 *
 * Builds a playable initial GameState from injected card/role/config data.
 * Pure and deterministic under a seeded rng. It imports only types and other
 * engine modules — never `constants`. The `setup` layer supplies the data.
 */

import type { GameState, Player, RoleIdentity, GameConfig } from '../types/game';
import type { ActionCard, MarketCard, Team } from '../types/cards';
import type { Definition, Rng } from './deck';
import { buildDrawPile, expandDefs, shuffle, deal } from './deck';
import { actionsForTurn } from './rules';
import { emptyGameState, PUBLIC_MARKET_SIZE, BLACK_MARKET_ROTATING } from './reducer';

export interface CreateGameOptions {
  playerNames: string[];
  /** Full role roster; split into teams internally. */
  roles: RoleIdentity[];
  /** Player-count configuration (teams, VP targets, starting resources). */
  config: GameConfig;
  /** Draw-pile card definitions (money/evidence/power/event). */
  actionDefs: Definition<ActionCard>[];
  /** Public Market pool (perks + weapons); 5 are dealt face-up. */
  publicMarketDefs: Definition<MarketCard>[];
  /** Black Market pool (perks + weapons); 3 are dealt face-up. */
  blackMarketDefs: Definition<MarketCard>[];
  /** Expand Network definition, placed face-up in the Black Market. */
  expandNetworkDef?: Definition<MarketCard>;
  rng?: Rng;
}

/** Civilians take even seats, Criminals odd — which alternates them and
 * matches every rulebook player-count split (Civilians >= Criminals). */
function teamForSeat(seat: number): Team {
  return seat % 2 === 0 ? 'CIVILIAN' : 'CRIMINAL';
}

/**
 * The seat that takes the first turn (rulebook p.3). In odd-player games the
 * starting Civilian is the one seated right after another Civilian; otherwise
 * (even games) any Civilian may start and we take the first-seated one.
 */
function startingCivilian(players: Player[]): number {
  const n = players.length;
  const isCiv = (i: number) => players[(i + n) % n]?.team === 'CIVILIAN';
  if (n % 2 === 1) {
    for (let i = 0; i < n; i++) {
      if (isCiv(i) && isCiv(i - 1)) return i;
    }
  }
  const first = players.findIndex((p) => p.team === 'CIVILIAN');
  return first < 0 ? 0 : first;
}

export function createGame(options: CreateGameOptions): GameState {
  const { playerNames, roles, config, actionDefs, publicMarketDefs, blackMarketDefs, expandNetworkDef, rng = Math.random } = options;

  const civRoles = shuffle(roles.filter((r) => r.team === 'CIVILIAN'), rng);
  const crimRoles = shuffle(roles.filter((r) => r.team === 'CRIMINAL'), rng);

  let drawPile = buildDrawPile(actionDefs, rng);

  const players: Player[] = playerNames.map((name, seat) => {
    const team = teamForSeat(seat);
    const role = (team === 'CIVILIAN' ? civRoles : crimRoles).pop() as RoleIdentity;
    const setup = team === 'CIVILIAN' ? config.civSetup : config.crimSetup;

    const { dealt, rest } = deal(drawPile, setup.startingCards);
    drawPile = rest;

    return {
      id: `p${seat}`,
      name,
      team,
      role,
      hand: dealt,
      inventory: [],
      money: setup.startingMoney,
      powerLevel: role.powerlevel,
      actionsRemaining: 0,
      hasPurchasedFromMarket: false,
      hasUsedRoleAbility: false,
      hasAttacked: false,
      isInjured: false,
      isExposed: false,
      isCaptured: false,
      hasBodyguardToken: false,
      vigilanteStacks: 0,
    };
  });

  // Bodyguard's Protection: at game start the token goes to a Civilian
  // teammate (rulebook p.17). Prefer a different Civilian; fall back to the
  // Bodyguard themselves if they have no teammate.
  const bodyguardIndex = players.findIndex((p) => p.role.id === 'bodyguard');
  if (bodyguardIndex >= 0) {
    const teammateIndex = players.findIndex(
      (p, i) => i !== bodyguardIndex && p.team === 'CIVILIAN',
    );
    const holder = teammateIndex >= 0 ? teammateIndex : bodyguardIndex;
    players[holder] = { ...players[holder], hasBodyguardToken: true };
  }

  // Face-up markets plus the face-down decks they refill from (rulebook p.6).
  const publicPool = shuffle(expandDefs(publicMarketDefs, 'pm'), rng);
  const blackPool = shuffle(expandDefs(blackMarketDefs, 'bm'), rng);

  const publicMarket = publicPool.slice(0, PUBLIC_MARKET_SIZE);
  const publicMarketDeck = publicPool.slice(PUBLIC_MARKET_SIZE);

  const blackMarket = blackPool.slice(0, BLACK_MARKET_ROTATING);
  const blackMarketDeck = blackPool.slice(BLACK_MARKET_ROTATING);

  // Expand Network copies rise in price with each purchase ($5, $6, $7, $8…).
  // The cheapest sits face-up; the rest wait in the pile (rulebook p.16).
  let expandNetworkPile: MarketCard[] = expandNetworkDef
    ? expandDefs([expandNetworkDef], 'en').map((c, i) => ({ ...c, cost: expandNetworkDef.cost + i }))
    : [];
  if (expandNetworkPile.length > 0) {
    blackMarket.unshift(expandNetworkPile[0]);
    expandNetworkPile = expandNetworkPile.slice(1);
  }

  // Civilians go first (rulebook p.3). In odd-player games the starter is the
  // Civilian seated immediately after another Civilian; otherwise the Civilians
  // pick, and we default to the first-seated one.
  const currentPlayerIndex = startingCivilian(players);
  players[currentPlayerIndex] = {
    ...players[currentPlayerIndex],
    actionsRemaining: actionsForTurn(players[currentPlayerIndex]),
  };

  return {
    ...emptyGameState(),
    players,
    currentPlayerIndex,
    drawPile,
    publicMarket,
    publicMarketDeck,
    blackMarket,
    blackMarketDeck,
    expandNetworkPile,
    teamScores: { CIVILIAN: 0, CRIMINAL: 0 },
    vpTargets: config.vpTargets,
    gameLog: ['The Rush begins!'],
  };
}
