/**
 * src/engine/createGame.ts
 *
 * Builds a playable initial GameState from injected card/role/config data.
 * Pure and deterministic under a seeded rng. It imports only types and other
 * engine modules — never `constants`. The `setup` layer supplies the data.
 */

import type { GameState, Player, RoleIdentity, GameConfig } from '../types/game.js';
import type { ActionCard, MarketCard, Team } from '../types/cards.js';
import type { Definition, Rng } from './deck.js';
import { buildDrawPile, expandDefs, shuffle, deal } from './deck.js';
import { actionsForTurn } from './rules.js';
import { emptyGameState, PUBLIC_MARKET_SIZE, BLACK_MARKET_ROTATING } from './reducer.js';

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

/**
 * Randomly assigns each turn-order position to a team, using the player
 * count's fixed split (config.civilians/criminals, e.g. 2v2 at 4 players —
 * rulebook, Civilians >= Criminals). Shuffled independently of join order,
 * so which team a player lands on has nothing to do with when they joined.
 */
function assignTeams(config: GameConfig, rng: Rng): Team[] {
  const teams: Team[] = [
    ...Array<Team>(config.civilians).fill('CIVILIAN'),
    ...Array<Team>(config.criminals).fill('CRIMINAL'),
  ];
  return shuffle(teams, rng);
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

  // Three independent shuffles, in this order: (1) turn order, so seating —
  // and therefore who's whose neighbor — doesn't depend on join order; (2)
  // team, onto that shuffled order; (3) which specific role within a team
  // (civRoles/crimRoles above). `id` stays `p${lobbySeat}` regardless of where
  // that seat lands in turn order — the online room layer keys off lobby seat
  // (see protocol.ts's RoomPlayer), so that identity has to stay stable even
  // though array position (turn order) no longer matches it.
  const turnOrder = shuffle(playerNames.map((_, lobbySeat) => lobbySeat), rng);
  const teams = assignTeams(config, rng);

  let drawPile = buildDrawPile(actionDefs, rng);

  const players: Player[] = turnOrder.map((lobbySeat, turnPos) => {
    const team = teams[turnPos];
    const role = (team === 'CIVILIAN' ? civRoles : crimRoles).pop() as RoleIdentity;
    const setup = team === 'CIVILIAN' ? config.civSetup : config.crimSetup;

    const { dealt, rest } = deal(drawPile, setup.startingCards);
    drawPile = rest;

    return {
      id: `p${lobbySeat}`,
      name: playerNames[lobbySeat],
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
  // teammate (rulebook p.17). With only one possible teammate (4-player
  // games: 2 Civilians total) there's nothing to choose, so it's assigned
  // automatically. With a genuine choice (5+ players, 2+ other Civilian
  // teammates) the Bodyguard picks — see pendingBodyguardSetup/
  // resolveBodyguardSetup — and play can't start until they do.
  const bodyguardIndex = players.findIndex((p) => p.role.id === 'bodyguard');
  let pendingBodyguardSetup: GameState['pendingBodyguardSetup'] = null;
  if (bodyguardIndex >= 0) {
    const teammateIndices = players
      .map((_, i) => i)
      .filter((i) => i !== bodyguardIndex && players[i].team === players[bodyguardIndex].team);
    if (teammateIndices.length > 1) {
      pendingBodyguardSetup = { bodyguardId: players[bodyguardIndex].id };
    } else {
      const holder = teammateIndices.length === 1 ? teammateIndices[0] : bodyguardIndex;
      players[holder] = { ...players[holder], hasBodyguardToken: true };
    }
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
    pendingBodyguardSetup,
    gameLog: pendingBodyguardSetup
      ? ['The Rush begins!', 'The Bodyguard must give the Protection token to a teammate.']
      : ['The Rush begins!'],
  };
}
