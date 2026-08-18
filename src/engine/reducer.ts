/**
 * src/engine/reducer.ts
 *
 * The core game state machine. Pure: (state, action) -> state. It operates on a
 * state that has already been seeded with a deck and markets (see createGame),
 * so it needs no card data and never imports `constants`.
 */

import type { GameState, Player, CombatSide, CombatState, CombatChoiceInput } from '../types/game.js';
import type { ActionCard, EvidenceCategory, MarketCard, WeaponType } from '../types/cards.js';
import { determineWinner } from './scoring.js';
import type { Rng } from './deck.js';
import {
  actionsForTurn,
  applyScore,
  isGridComplete,
  log,
  playerIndexById,
  updatePlayer,
} from './rules.js';
import {
  applyCombatChoice,
  attackActionCost,
  attackError,
  buildPendingChoices,
  enterPowerPhase,
  hasItem,
  otherSide,
  powerCardEligible,
  powerCardValue,
  resolveCombat,
  resolvePreCombat,
} from './combat.js';

export type GameAction =
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_CARD'; cardId: string; category?: EvidenceCategory; targetId?: string; options?: EventOptions }
  | { type: 'PLAY_EVIDENCE'; cardId: string; category: EvidenceCategory }
  | { type: 'PURCHASE'; cardId: string }
  | { type: 'SELL'; cardId: string }
  | { type: 'EXPOSE'; targetId: string; evidenceChoices?: Partial<Record<EvidenceCategory, string>> }
  | { type: 'ATTACK'; targetId: string }
  | { type: 'PLAY_POWER'; cardId: string; side: CombatSide; byPlayerId?: string; mirrorTargetCardId?: string }
  | { type: 'COMBAT_DISCARD_MONEY'; side: CombatSide; cardIds: string[] }
  | { type: 'COMBAT_CHOICE'; input: CombatChoiceInput }
  | { type: 'PASS_COMBAT'; side: CombatSide }
  | { type: 'USE_ROLE_ABILITY'; payload?: RoleAbilityPayload }
  | { type: 'INITIATE_TRADE'; targetId: string; give: TradeItem }
  | { type: 'RESOLVE_TRADE_RETURN'; give: TradeItem | null }
  | { type: 'RESOLVE_EXPRESS_SHIPPING'; mode: 'MONEY' | 'DRAW' }
  | { type: 'USE_PERK'; perkId: string; payload?: PerkPayload }
  | { type: 'CLEAR_TRAFFIC' }
  | { type: 'USE_MARKET_DISCOUNT'; cardId: string }
  | { type: 'SKIP_MARKET_DISCOUNT' }
  | { type: 'RESOLVE_THREATEN'; mode: 'MONEY' | 'DISCARD' }
  | { type: 'RESOLVE_SHERIFF'; cardId: string; category?: EvidenceCategory }
  | { type: 'END_TURN' };

/**
 * Parameters for an "Action:" perk (see applyPerk). Which fields matter depends
 * on the perk:
 *  - cardId       — a hand card (Bank Money, Recycling Bin discard, Alarm Clock Event),
 *                   or the opponent's Event card chosen to force-play (Shady Press).
 *  - marketCardId — a Market card to buy (Credit Card).
 *  - targetId     — the affected player (Hacked Passwords, Alarm Clock event target),
 *                   or the opponent being pressed (Shady Press).
 *  - discardForBonus — Credit Card: discard the card for a $2 discount instead of $1.
 *  - eventTargetId, eventOptions — Shady Press: the forced Event card's own
 *    target/options (e.g. who Tax Collection taxes), gathered from the
 *    Criminal using Shady Press, distinct from `targetId` above.
 */
export interface PerkPayload {
  cardId?: string;
  marketCardId?: string;
  targetId?: string;
  discardForBonus?: boolean;
  eventTargetId?: string;
  eventOptions?: EventOptions;
}

/**
 * One trade gift (rulebook p.7): money, a hand card, or a weapon (by
 * `cardId`). Perks are intentionally not tradeable. A trade is two one-way
 * gifts, not a single atomic swap — INITIATE_TRADE's `give` is the
 * initiator's choice; RESOLVE_TRADE_RETURN's `give` is the *teammate's own*
 * choice of what to give back (or null if they have nothing to give).
 */
export interface TradeItem {
  kind: 'MONEY' | 'CARD' | 'WEAPON';
  cardId?: string;
}

/**
 * Parameters for the current player's role Action. Which fields matter depends
 * on the player's role (see applyRoleAbility):
 *  - cardId    — a Market card (Collector/Crime Lord/Evil Scientist/Smuggler), a
 *                hand card (Sheriff evidence, Forger evidence), or a
 *                discard-pile card (Witness evidence).
 *  - targetId  — the affected player (Sheriff/Robber/Arsonist/Bodyguard/Witness).
 *  - category  — the Evidence grid slot to fill/clear (Sheriff/Forger).
 *  - gridCardId — Forger: which specific card to clear from `category`, when
 *                 more than one has piled up there (defaults to the oldest).
 *  - mode      — a sub-choice: Robber 'MONEY'|'CARD'. (Arsonist's Threaten is
 *                the target's choice, not the actor's — see pendingThreaten.)
 */
export interface RoleAbilityPayload {
  cardId?: string;
  targetId?: string;
  category?: EvidenceCategory;
  gridCardId?: string;
  mode?: 'MONEY' | 'CARD' | 'DISCARD';
}

/**
 * Secondary choices some Event cards need beyond `targetId` (see resolveEvent):
 *  - marketCardId    — a Market card to buy (Market Access).
 *  - inventoryCardId — an owned perk/weapon (Business Opportunity sell,
 *                      Market Exchange give/take).
 *  - takePerk        — Market Exchange direction: take from the teammate (true)
 *                      vs give to them (false, the default).
 *  - discardMarketIds— exactly 3 Market card ids to bin for Spring Cleaning; the
 *                      player must choose these (no default — see resolveEvent).
 * Omitted choices fall back to sensible defaults or leave the effect manual.
 */
export interface EventOptions {
  marketCardId?: string;
  inventoryCardId?: string;
  takePerk?: boolean;
  discardMarketIds?: string[];
  /** Ally Support: parameters for the copied Action (role- or perk-shaped). */
  allyPayload?: RoleAbilityPayload & PerkPayload;
  /** Ally Support: id of the teammate's perk to copy instead of their role Action. */
  allyPerkId?: string;
}

const MAX_PERKS = 4;
const MAX_WEAPONS = 2;

/** Face-up market sizes (rulebook p.3): 5 public, Expand Network + 3 rotating black. */
export const PUBLIC_MARKET_SIZE = 5;
export const BLACK_MARKET_ROTATING = 3;

/** An empty pre-game state. createGame() produces a playable one. */
export function emptyGameState(): GameState {
  return {
    players: [],
    currentPlayerIndex: 0,
    drawPile: [],
    discardPile: [],
    publicMarket: [],
    blackMarket: [],
    evidenceGrid: {
      TIME: { cards: [] },
      MEANS: { cards: [] },
      LOCATION: { cards: [] },
      MOTIVE: { cards: [] },
    },
    teamScores: { CIVILIAN: 0, CRIMINAL: 0 },
    vpTargets: { CIVILIAN: 0, CRIMINAL: 0 },
    gameLog: [],
    winner: null,
    combat: null,
    lastPeek: null,
    publicMarketDeck: [],
    blackMarketDeck: [],
    expandNetworkPile: [],
    trashPile: [],
    pendingMarketDiscount: null,
    pendingThreaten: null,
    pendingTrade: null,
    pendingExpressShipping: null,
    pendingSheriff: null,
  };
}

/**
 * Refill the face-up markets from their draw piles after a purchase removes a
 * card (rulebook p.6). Tops the public market up to 5, keeps an Expand Network
 * face-up while copies remain (its rising price is baked into the pile order),
 * and refills the rotating (non-SPECIAL, non-smuggled) Black Market slots up
 * to 3. A Smuggler's moved card sits on top of that rotation as a one-time
 * extra: it doesn't count toward the 3, and buying it never draws a
 * replacement — only vacating one of the *regular* 3 slots does.
 */
function refillMarkets(state: GameState): GameState {
  let publicMarket = state.publicMarket;
  let blackMarket = state.blackMarket;
  let publicMarketDeck = state.publicMarketDeck ?? [];
  let blackMarketDeck = state.blackMarketDeck ?? [];
  let expandNetworkPile = state.expandNetworkPile ?? [];

  while (publicMarket.length < PUBLIC_MARKET_SIZE && publicMarketDeck.length > 0) {
    publicMarket = [...publicMarket, publicMarketDeck[0]];
    publicMarketDeck = publicMarketDeck.slice(1);
  }

  if (!blackMarket.some((c) => c.type === 'SPECIAL') && expandNetworkPile.length > 0) {
    blackMarket = [expandNetworkPile[0], ...blackMarket];
    expandNetworkPile = expandNetworkPile.slice(1);
  }

  let rotating = blackMarket.filter((c) => c.type !== 'SPECIAL' && !c.smuggled).length;
  while (rotating < BLACK_MARKET_ROTATING && blackMarketDeck.length > 0) {
    blackMarket = [...blackMarket, blackMarketDeck[0]];
    blackMarketDeck = blackMarketDeck.slice(1);
    rotating++;
  }

  return { ...state, publicMarket, blackMarket, publicMarketDeck, blackMarketDeck, expandNetworkPile };
}

/** Actions that are valid while a combat's Power phase is in progress. */
const COMBAT_ACTIONS = new Set(['PLAY_POWER', 'COMBAT_DISCARD_MONEY', 'PASS_COMBAT', 'COMBAT_CHOICE']);

export function gameReducer(state: GameState, action: GameAction, rng: Rng = Math.random): GameState {
  return withSpyPeek(gameReducerCore(state, action, rng));
}

/**
 * The Spy's Recon: at all times, the top card of the deck — visible only to
 * the Spy, and only during their own turn. Recomputed after every action
 * (rather than snapshotted at turn start) so it's always the true current
 * top card, even after the Spy or a teammate's effect draws into it.
 * `redactState` in online/room.ts strips this for every other viewer.
 */
function withSpyPeek(state: GameState): GameState {
  const current = state.players[state.currentPlayerIndex];
  const canPeek = current && current.role.id === 'spy' && !current.isCaptured && state.drawPile.length > 0;
  return { ...state, lastPeek: canPeek ? { playerId: current.id, cards: [state.drawPile[0]] } : null };
}

function gameReducerCore(state: GameState, action: GameAction, rng: Rng): GameState {
  if (state.winner) return state; // game over — ignore further actions
  const idx = state.currentPlayerIndex;
  const player = state.players[idx];
  if (!player) return state;

  // While a fight is underway, only combat actions resolve it.
  if (state.combat && !COMBAT_ACTIONS.has(action.type)) {
    return log(state, 'Resolve the current combat before taking other actions.');
  }

  // A pending Threaten choice is the target's decision, not the current
  // player's — block everything else until they resolve it.
  if (state.pendingThreaten && action.type !== 'RESOLVE_THREATEN') {
    return log(state, 'Resolve the Threaten choice before taking other actions.');
  }

  // Trade's return gift belongs to the teammate who received the first half,
  // not whoever's turn it nominally is — block everything else until they
  // give something back (or confirm they have nothing to).
  if (state.pendingTrade && action.type !== 'RESOLVE_TRADE_RETURN') {
    return log(state, 'Resolve the pending trade before taking other actions.');
  }

  // Express Shipping's $1-or-draw choice is a direct consequence of the Trade
  // that just resolved — block everything else until it's answered.
  if (state.pendingExpressShipping && action.type !== 'RESOLVE_EXPRESS_SHIPPING') {
    return log(state, 'Choose Express Shipping\'s payout before taking other actions.');
  }

  // The Sheriff has already spent the action subpoenaing an opponent; they
  // must play one of the revealed Evidence cards before doing anything else.
  if (state.pendingSheriff && action.type !== 'RESOLVE_SHERIFF') {
    return log(state, "Resolve the Sheriff's subpoena before taking other actions.");
  }

  switch (action.type) {
    case 'DRAW_CARD':
      return drawCard(state, idx, player);
    case 'PLAY_CARD':
      return playCard(state, idx, player, action.cardId, action.category, action.targetId, action.options);
    case 'PLAY_EVIDENCE':
      return playEvidence(state, idx, player, action.cardId, action.category);
    case 'PURCHASE':
      return purchase(state, idx, player, action.cardId);
    case 'SELL':
      return sellItem(state, idx, player, action.cardId);
    case 'EXPOSE':
      return expose(state, idx, player, action.targetId, action.evidenceChoices);
    case 'ATTACK':
      return attack(state, idx, player, action.targetId);
    case 'PLAY_POWER':
      return playPower(state, action.cardId, action.side, action.byPlayerId, action.mirrorTargetCardId);
    case 'COMBAT_DISCARD_MONEY':
      return combatDiscardMoney(state, action.side, action.cardIds);
    case 'COMBAT_CHOICE':
      return applyCombatChoice(state, action.input, rng);
    case 'PASS_COMBAT':
      return passCombat(state, action.side);
    case 'USE_ROLE_ABILITY':
      return applyRoleAbility(state, idx, player, action.payload ?? {});
    case 'INITIATE_TRADE':
      return initiateTrade(state, idx, player, action.targetId, action.give);
    case 'RESOLVE_TRADE_RETURN':
      return resolveTradeReturn(state, action.give);
    case 'RESOLVE_EXPRESS_SHIPPING':
      return resolveExpressShipping(state, action.mode);
    case 'USE_PERK':
      return applyPerk(state, idx, player, action.perkId, action.payload ?? {});
    case 'CLEAR_TRAFFIC':
      return clearTraffic(state, idx, player);
    case 'USE_MARKET_DISCOUNT':
      return redeemMarketDiscount(state, idx, player, action.cardId);
    case 'SKIP_MARKET_DISCOUNT':
      return skipMarketDiscount(state, player);
    case 'RESOLVE_THREATEN':
      return resolveThreaten(state, action.mode);
    case 'RESOLVE_SHERIFF':
      return resolveSheriff(state, action.cardId, action.category);
    case 'END_TURN':
      return endTurn(state, idx);
    default:
      return state;
  }
}

// --- Action handlers ---------------------------------------------------------

function drawCard(state: GameState, idx: number, player: Player): GameState {
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);

  let drawPile = state.drawPile;
  let discardPile = state.discardPile;
  let s = state;

  if (drawPile.length === 0) {
    if (discardPile.length === 0) return log(state, 'The deck and discard are both empty.');
    // Reshuffle discard into the draw pile; both teams score a VP (rulebook §5).
    drawPile = discardPile;
    discardPile = [];
    const teamScores = {
      CIVILIAN: s.teamScores.CIVILIAN + 1,
      CRIMINAL: s.teamScores.CRIMINAL + 1,
    };
    const winner = determineWinner(teamScores, s.vpTargets, s.winner);
    s = { ...log(s, 'The deck ran out — both teams score a VP and the discard is reshuffled.'), teamScores, winner };
    if (s.winner) return { ...s, drawPile, discardPile };
    // The Criminals' deck-out VP feeds the Vigilante(s) like any other.
    s = triggerVigilante({ ...s, drawPile, discardPile });
    ({ drawPile, discardPile } = s);
  }

  const [top, ...rest] = drawPile;
  s = updatePlayer(s, idx, (p) => ({
    ...p,
    hand: [...p.hand, top],
    actionsRemaining: p.actionsRemaining - 1,
  }));
  return log({ ...s, drawPile: rest, discardPile }, `${player.name} drew a card.`);
}

function playCard(
  state: GameState,
  idx: number,
  player: Player,
  cardId: string,
  category: EvidenceCategory | undefined,
  targetId: string | undefined,
  options: EventOptions | undefined,
): GameState {
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return log(state, 'That card is not in your hand.');
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);

  switch (card.type) {
    case 'EVIDENCE': {
      if (player.team === 'CRIMINAL') return burnEvidence(state, idx, player, cardId);
      if (!category) return log(state, 'Choose a category to play this evidence into.');
      return playEvidence(state, idx, player, cardId, category);
    }
    case 'MONEY': {
      const gain = card.value ?? 0;
      let s = updatePlayer(state, idx, (p) => ({
        ...p,
        money: p.money + gain,
        hand: p.hand.filter((c) => c.id !== cardId),
        actionsRemaining: p.actionsRemaining - 1,
      }));
      s = { ...s, discardPile: [...s.discardPile, card] };
      return log(s, `${player.name} played ${card.name} for $${gain}.`);
    }
    case 'EVENT': {
      let s = updatePlayer(state, idx, (p) => ({
        ...p,
        hand: p.hand.filter((c) => c.id !== cardId),
        actionsRemaining: p.actionsRemaining - 1,
      }));
      s = { ...s, discardPile: [...s.discardPile, card] };
      s = resolveEvent(s, idx, card.name, targetId, options ?? {});
      return log(s, `${player.name} played ${card.name}.`);
    }
    case 'POWER':
    default:
      return log(state, 'Power cards can only be played during combat.');
  }
}

/**
 * Resolve an Event's effect (rulebook p.11). The card has already been moved to
 * the discard and its action spent by the caller. Choices beyond `targetId`
 * arrive via `options`; missing choices fall back to sensible defaults. Only
 * Ally Support (copy a teammate's Action) remains manual — it needs a re-entrant
 * ability system this reducer doesn't have.
 */
function resolveEvent(state: GameState, idx: number, name: string, targetId: string | undefined, options: EventOptions): GameState {
  const actor = state.players[idx];
  switch (name) {
    case 'Receive Package': {
      // Draw up to 3 cards.
      let s = state;
      for (let i = 0; i < 3; i++) s = gameReducerDraw(s);
      return s;
    }
    case 'Generational Wealth': {
      return state.players.reduce(
        (acc, p, i) => (p.team === actor.team ? updatePlayer(acc, i, (pl) => ({ ...pl, money: pl.money + 1 })) : acc),
        state,
      );
    }
    case 'Tax Collection': {
      const victimIndex = targetId ? playerIndexById(state, targetId) : -1;
      const victim = state.players[victimIndex];
      if (!victim || victim.team === actor.team) return log(state, 'Choose an opponent to tax.');
      if (victim.money < 1) return log(state, `${victim.name} has no money to tax.`);
      let s = updatePlayer(state, victimIndex, (p) => ({ ...p, money: p.money - 1 }));
      s = updatePlayer(s, idx, (p) => ({ ...p, money: p.money + 1 }));
      return log(s, `${actor.name} taxed ${victim.name} for $1.`);
    }
    case 'Market Access': {
      // Buy one Market card at a $1 discount (doesn't use the turn's purchase).
      if (!options.marketCardId) return log(state, 'Choose a Market card to buy at a discount.');
      const { state: s } = doPurchase(state, idx, actor, options.marketCardId, {
        spendAction: false,
        setPurchaseFlag: false,
        costDelta: -1,
      });
      return s;
    }
    case 'Gain Influence': {
      // Randomly take a card from a chosen opponent (we take the first as "random").
      const victimIndex = targetId ? playerIndexById(state, targetId) : -1;
      const victim = state.players[victimIndex];
      if (!victim || victim.team === actor.team) return log(state, 'Choose an opponent to influence.');
      if (victim.hand.length === 0) return log(state, `${victim.name} has no cards to take.`);
      const taken = victim.hand[0];
      let s = updatePlayer(state, victimIndex, (p) => ({ ...p, hand: p.hand.slice(1) }));
      s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, taken] }));
      return log(s, `${actor.name} takes a card from ${victim.name}.`);
    }
    case 'Market Exchange': {
      // Give a perk to, or take a perk from, a teammate — then draw a card.
      const mateIndex = targetId ? playerIndexById(state, targetId) : -1;
      const mate = state.players[mateIndex];
      if (!mate || mateIndex === idx || mate.team !== actor.team) return log(state, 'Choose a teammate to exchange with.');
      const [fromIndex, toIndex] = options.takePerk ? [mateIndex, idx] : [idx, mateIndex];
      const from = state.players[fromIndex];
      const to = state.players[toIndex];
      const perk = from.inventory.find((c) => c.id === options.inventoryCardId && c.type === 'PERK');
      if (!perk) return log(state, 'That is not a perk to exchange.');
      if (to.inventory.filter((c) => c.type !== 'WEAPON').length >= MAX_PERKS) return log(state, `${to.name} already has 4 perks.`);
      let s = updatePlayer(state, fromIndex, (p) => ({ ...p, inventory: p.inventory.filter((c) => c.id !== perk.id) }));
      s = updatePlayer(s, toIndex, (p) => ({ ...p, inventory: [...p.inventory, perk] }));
      s = gameReducerDraw(s);
      return log(s, `${actor.name} exchanges ${perk.name} with ${mate.name} and draws a card.`);
    }
    case 'Business Opportunity': {
      // Sell one owned perk/weapon for its cost + $1.
      const item = actor.inventory.find((c) => c.id === options.inventoryCardId);
      if (!item) return log(state, 'Choose a perk or weapon to sell.');
      if (item.type === 'SPECIAL' || item.name === 'Investment') return log(state, `${item.name} cannot be sold.`);
      const payout = item.cost + 1;
      const s = updatePlayer(state, idx, (p) => ({
        ...p,
        inventory: p.inventory.filter((c) => c.id !== item.id),
        money: p.money + payout,
      }));
      return log(s, `${actor.name} sells ${item.name} for $${payout}.`);
    }
    case 'Lottery': {
      // Reveal top 3: bank any Money cards' value, discard the rest.
      const revealed = state.drawPile.slice(0, 3);
      if (revealed.length === 0) return log(state, 'The deck is empty — nothing to reveal.');
      const gain = revealed.reduce((sum, c) => sum + (c.type === 'MONEY' ? c.value ?? 0 : 0), 0);
      let s: GameState = {
        ...state,
        drawPile: state.drawPile.slice(revealed.length),
        discardPile: [...state.discardPile, ...revealed],
      };
      s = updatePlayer(s, idx, (p) => ({ ...p, money: p.money + gain }));
      return log(s, `${actor.name} plays the Lottery: reveals ${revealed.length} card(s) and banks $${gain}.`);
    }
    case 'Spring Cleaning': {
      // Bin exactly 3 chosen Market cards and replace them from the deck. The
      // replacements are unknown ahead of time, so the discounted purchase the
      // rulebook offers afterward is a separate pending step the player resolves
      // once they can see the refreshed Market (see pendingMarketDiscount).
      const chosen = (options.discardMarketIds ?? []).filter((id) => state.publicMarket.some((c) => c.id === id));
      if (chosen.length !== 3) return log(state, 'Choose exactly 3 Market cards to discard.');
      const toBin = new Set(chosen);
      let s: GameState = { ...state, publicMarket: state.publicMarket.filter((c) => !toBin.has(c.id)) };
      s = refillMarkets(s);
      s = log(s, `${actor.name} does some Spring Cleaning of the Market.`);
      return { ...s, pendingMarketDiscount: { playerId: actor.id, amount: 1 } };
    }
    case 'Traffic Jam': {
      // Give an opponent a Traffic token (trading with them costs 2 actions).
      const victimIndex = targetId ? playerIndexById(state, targetId) : -1;
      const victim = state.players[victimIndex];
      if (!victim || victim.team === actor.team) return log(state, 'Traffic Jam must target an opponent.');
      const s = updatePlayer(state, victimIndex, (p) => ({ ...p, trafficToken: true }));
      return log(s, `${actor.name} snarls ${victim.name} in a Traffic Jam.`);
    }
    case 'Ally Support': {
      // Copy a teammate's role OR perk Action, performed by the actor for free.
      const mateIndex = targetId ? playerIndexById(state, targetId) : -1;
      const mate = state.players[mateIndex];
      if (!mate || mateIndex === idx || mate.team !== actor.team) return log(state, 'Ally Support must copy a teammate.');
      if (mate.isInjured || mate.isCaptured) return log(state, `${mate.name}'s Action cannot be copied while injured or captured.`);
      if (options.allyPerkId) {
        const perk = mate.inventory.find((c) => c.id === options.allyPerkId && c.type !== 'WEAPON');
        if (!perk) return log(state, `${mate.name} has no such perk to copy.`);
        const s = applyPerk(state, idx, actor, perk.id, options.allyPayload ?? {}, { perk, free: true });
        return log(s, `${actor.name} uses Ally Support to copy ${mate.name}'s ${perk.name}.`);
      }
      const s = applyRoleAbility(state, idx, actor, options.allyPayload ?? {}, { roleId: mate.role.id, free: true });
      return log(s, `${actor.name} uses Ally Support to copy ${mate.name}'s ${mate.role.abilityName}.`);
    }
    default:
      return log(state, `${name} resolved (manual effect).`);
  }
}

/** Draw one card for the current player without spending an action (event helper). */
function gameReducerDraw(state: GameState): GameState {
  const idx = state.currentPlayerIndex;
  let drawPile = state.drawPile;
  let discardPile = state.discardPile;
  let s = state;
  if (drawPile.length === 0) {
    if (discardPile.length === 0) return s;
    drawPile = discardPile;
    discardPile = [];
    const teamScores = { CIVILIAN: s.teamScores.CIVILIAN + 1, CRIMINAL: s.teamScores.CRIMINAL + 1 };
    s = { ...log(s, 'The deck ran out — both teams score a VP.'), teamScores, winner: determineWinner(teamScores, s.vpTargets, s.winner) };
    if (s.winner) return { ...s, drawPile, discardPile };
    s = triggerVigilante({ ...s, drawPile, discardPile });
    ({ drawPile, discardPile } = s);
  }
  const [top, ...rest] = drawPile;
  if (!top) return { ...s, drawPile: rest, discardPile };
  s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, top] }));
  return { ...s, drawPile: rest, discardPile };
}

/**
 * Draw one card into an arbitrary player's hand without spending an action.
 * Reshuffles the discard silently if the draw pile is empty (no deck-out VP —
 * that scoring belongs to the acting player's DRAW_CARD, and scoring here could
 * recursively re-trigger the Vigilante). Skips if both piles are empty.
 */
function drawForPlayer(state: GameState, index: number): GameState {
  let drawPile = state.drawPile;
  let discardPile = state.discardPile;
  if (drawPile.length === 0) {
    if (discardPile.length === 0) return state;
    drawPile = discardPile;
    discardPile = [];
  }
  const [top, ...rest] = drawPile;
  if (!top) return { ...state, drawPile: rest, discardPile };
  const s = updatePlayer(state, index, (p) => ({ ...p, hand: [...p.hand, top] }));
  return { ...s, drawPile: rest, discardPile };
}

/**
 * The Vigilante's Vengeance: every time the Criminals score a VP, each Civilian
 * Vigilante draws a card and gains +1 PL, up to a permanent +3 total. Call this
 * right after any Criminal VP is scored.
 */
function triggerVigilante(state: GameState): GameState {
  let s = state;
  state.players.forEach((p, i) => {
    if (p.team !== 'CIVILIAN' || p.role.id !== 'vigilante') return;
    s = drawForPlayer(s, i);
    const stacks = p.vigilanteStacks ?? 0;
    if (stacks < 3) {
      s = updatePlayer(s, i, (pl) => ({
        ...pl,
        powerLevel: pl.powerLevel + 1,
        vigilanteStacks: (pl.vigilanteStacks ?? 0) + 1,
      }));
    }
    s = log(s, `${p.name} (Vigilante) draws and steels themselves against the Criminals.`);
  });
  return s;
}

function sellItem(state: GameState, idx: number, player: Player, cardId: string): GameState {
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
  const card = player.inventory.find((c) => c.id === cardId);
  if (!card) return log(state, 'That item is not in your inventory.');
  if (card.type === 'SPECIAL') return log(state, `${card.name} cannot be sold.`);
  if (card.name === 'Investment') return log(state, 'Investment cannot be sold.');

  const s = updatePlayer(state, idx, (p) => ({
    ...p,
    inventory: p.inventory.filter((c) => c.id !== cardId),
    money: p.money + 1,
    actionsRemaining: p.actionsRemaining - 1,
  }));
  return log(s, `${player.name} sold ${card.name} for $1.`);
}

function playEvidence(
  state: GameState,
  idx: number,
  player: Player,
  cardId: string,
  category: EvidenceCategory,
): GameState {
  if (player.team !== 'CIVILIAN') return log(state, 'Only Civilians can play evidence into the grid.');
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);

  const card = player.hand.find((c) => c.id === cardId);
  if (!card || card.type !== 'EVIDENCE') return log(state, 'That card is not evidence.');
  if (!card.evidenceCategories?.includes(category)) {
    return log(state, `${card.name} cannot satisfy ${category}.`);
  }

  let s = updatePlayer(state, idx, (p) => ({
    ...p,
    hand: p.hand.filter((c) => c.id !== cardId),
    actionsRemaining: p.actionsRemaining - 1,
  }));
  s = placeEvidence(s, card, category, player);
  return log(s, `${player.name} played ${card.name} into ${category}.`);
}

/**
 * Add an Evidence card to a grid category (it stays there — cards only leave
 * the grid via an Expose or the Forger, see resolveExpose / the 'forger' role
 * Action) and pay the Attorney's Retainer to any teammate Attorney other than
 * `playedBy`. More than one card may pile up in the same category; the caller
 * is responsible for removing the card from whoever's hand it came from and
 * for validating the play — this only mutates the grid and Attorney money.
 */
function placeEvidence(
  state: GameState,
  card: ActionCard,
  category: EvidenceCategory,
  playedBy: Player,
): GameState {
  let s: GameState = {
    ...state,
    evidenceGrid: {
      ...state.evidenceGrid,
      [category]: { cards: [...state.evidenceGrid[category].cards, card] },
    },
  };
  // Attorney's Retainer: teammate Attorneys collect $1.
  s = s.players.reduce((acc, p, i) => {
    if (p.team === 'CIVILIAN' && p.role.id === 'attorney' && p.id !== playedBy.id) {
      return updatePlayer(acc, i, (pl) => ({ ...pl, money: pl.money + 1 }));
    }
    return acc;
  }, s);
  return s;
}

/**
 * Burn Evidence (rulebook p.5): a Criminal may discard an Evidence card from
 * hand to draw 2 new cards, in place of playing it into the grid.
 */
function burnEvidence(state: GameState, idx: number, player: Player, cardId: string): GameState {
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
  const card = player.hand.find((c) => c.id === cardId);
  if (!card || card.type !== 'EVIDENCE') return log(state, 'That card is not evidence.');

  let s = updatePlayer(state, idx, (p) => ({
    ...p,
    hand: p.hand.filter((c) => c.id !== cardId),
    actionsRemaining: p.actionsRemaining - 1,
  }));
  s = { ...s, discardPile: [...s.discardPile, card] };
  s = gameReducerDraw(s);
  s = gameReducerDraw(s);
  return log(s, `${player.name} burned ${card.name} and drew 2 cards.`);
}

function purchase(state: GameState, idx: number, player: Player, cardId: string): GameState {
  if (player.hasPurchasedFromMarket) return log(state, `${player.name} already bought this turn.`);
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
  const { state: next, ok } = doPurchase(state, idx, player, cardId, {
    spendAction: true,
    setPurchaseFlag: true,
  });
  return ok ? next : log(state, next.gameLog[next.gameLog.length - 1] ?? 'Purchase failed.');
}

/**
 * Spring Cleaning's follow-up purchase: spends no action and doesn't count
 * against the once-per-turn Market limit, since the discount was already
 * earned by playing the Event. Only the player it was offered to may use it.
 */
function redeemMarketDiscount(state: GameState, idx: number, player: Player, cardId: string): GameState {
  const pending = state.pendingMarketDiscount;
  if (!pending || pending.playerId !== player.id) return log(state, 'No Market discount is available right now.');
  const { state: next, ok } = doPurchase(state, idx, player, cardId, {
    spendAction: false,
    setPurchaseFlag: false,
    costDelta: -pending.amount,
  });
  if (!ok) return next;
  return { ...next, pendingMarketDiscount: null };
}

function skipMarketDiscount(state: GameState, player: Player): GameState {
  const pending = state.pendingMarketDiscount;
  if (!pending || pending.playerId !== player.id) return state;
  return { ...state, pendingMarketDiscount: null };
}

/**
 * Resolve the Arsonist's Threaten choice (see pendingThreaten). This is the
 * targeted Civilian's own decision, so — like COMBAT_CHOICE — it isn't gated
 * by `state.currentPlayerIndex`; the target is identified from the pending
 * state itself, not from whoever's turn it nominally is.
 */
function resolveThreaten(state: GameState, mode: 'MONEY' | 'DISCARD'): GameState {
  const pending = state.pendingThreaten;
  if (!pending) return state;
  const targetIndex = playerIndexById(state, pending.targetId);
  const target = state.players[targetIndex];
  if (!target) return { ...state, pendingThreaten: null };

  const canMoney = target.money > 0;
  const canDiscard = target.hand.length > 0;
  const choice: 'MONEY' | 'DISCARD' =
    mode === 'DISCARD' && canDiscard ? 'DISCARD'
    : mode === 'MONEY' && canMoney ? 'MONEY'
    : canMoney ? 'MONEY' : 'DISCARD';

  if (choice === 'MONEY') {
    const s = updatePlayer(state, targetIndex, (p) => ({ ...p, money: p.money - 1 }));
    return log({ ...s, pendingThreaten: null }, `${target.name} loses $1.`);
  }
  const discarded = target.hand[0];
  let s = updatePlayer(state, targetIndex, (p) => ({ ...p, hand: p.hand.slice(1) }));
  s = { ...s, discardPile: [...s.discardPile, discarded], pendingThreaten: null };
  return log(s, `${target.name} discards a card.`);
}

/**
 * Resolve the Sheriff's card+category choice after their Subpoena reveal (see
 * pendingSheriff). The action was already spent when the target was
 * subpoenaed — pendingSheriff is only ever set once the reveal found at least
 * one Evidence card, so a play is always possible here.
 */
function resolveSheriff(state: GameState, cardId: string, category?: EvidenceCategory): GameState {
  const pending = state.pendingSheriff;
  if (!pending) return state;
  const sheriffIndex = playerIndexById(state, pending.sheriffId);
  const targetIndex = playerIndexById(state, pending.targetId);
  const sheriff = state.players[sheriffIndex];
  const target = state.players[targetIndex];
  if (!sheriff || !target) return { ...state, pendingSheriff: null };

  const card = pending.cards.find((c) => c.id === cardId);
  if (!card) return log(state, 'Choose one of the revealed Evidence cards.');
  const options = card.evidenceCategories ?? [];
  const resolvedCategory = options.length === 1 ? options[0] : category;
  if (!resolvedCategory || !options.includes(resolvedCategory)) {
    return log(state, `Choose a category for ${card.name}.`);
  }

  let s = updatePlayer(state, targetIndex, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== cardId) }));
  s = placeEvidence(s, card, resolvedCategory, sheriff);
  s = { ...s, pendingSheriff: null };
  return log(s, `${sheriff.name} (Sheriff) subpoenas ${target.name} and plays ${card.name} into ${resolvedCategory}.`);
}

interface PurchaseOptions {
  /** Deduct 1 action for the buy itself (false when a role Action pays it). */
  spendAction?: boolean;
  /** Set hasPurchasedFromMarket (the once-per-turn direct-purchase limit). */
  setPurchaseFlag?: boolean;
  /** Discount (negative) or surcharge (positive) applied to the listed cost. */
  costDelta?: number;
  /** If set, the card's weaponType must be one of these (Evil Scientist). */
  requireWeaponType?: WeaponType[];
}

/**
 * The shared buy pipeline used by the PURCHASE action and by the buy-based role
 * abilities (Collector, Crime Lord, Evil Scientist). Validates the market,
 * affordability, and slot limits; deducts money; and scores any VP-bearing card
 * (Expand Network), triggering the Vigilante on Criminal VPs. Returns the new
 * state and whether the purchase succeeded (on failure the state carries only a
 * log entry explaining why).
 */
function doPurchase(
  state: GameState,
  idx: number,
  player: Player,
  cardId: string,
  opts: PurchaseOptions,
): { state: GameState; ok: boolean } {
  const fail = (msg: string) => ({ state: log(state, msg), ok: false });

  const inPublic = state.publicMarket.find((c) => c.id === cardId);
  const inBlack = state.blackMarket.find((c) => c.id === cardId);
  const card = inPublic ?? inBlack;
  if (!card) return fail('That card is not available in a market.');
  if (inBlack && player.team !== 'CRIMINAL') return fail('Only Criminals may buy from the Black Market.');
  if (opts.requireWeaponType && (card.type !== 'WEAPON' || !card.weaponType || !opts.requireWeaponType.includes(card.weaponType))) {
    return fail(`${card.name} is not a ${opts.requireWeaponType.join('/')} weapon.`);
  }

  // Expand Network costs $1 more for captured Criminals (rulebook p.16).
  const surcharge = card.type === 'SPECIAL' && player.isCaptured ? 1 : 0;
  const cost = Math.max(0, card.cost + surcharge + (opts.costDelta ?? 0));
  if (player.money < cost) return fail(`${player.name} cannot afford ${card.name}.`);

  const perks = player.inventory.filter((c) => c.type !== 'WEAPON').length;
  const weapons = player.inventory.filter((c) => c.type === 'WEAPON').length;
  if (card.type === 'WEAPON' && weapons >= MAX_WEAPONS) return fail('You already have 2 weapons.');
  if (card.type !== 'WEAPON' && perks >= MAX_PERKS) return fail('You already have 4 perks.');

  let s = updatePlayer(state, idx, (p) => ({
    ...p,
    money: p.money - cost,
    inventory: [...p.inventory, card],
    actionsRemaining: p.actionsRemaining - (opts.spendAction ? 1 : 0),
    hasPurchasedFromMarket: opts.setPurchaseFlag ? true : p.hasPurchasedFromMarket,
  }));
  s = {
    ...s,
    publicMarket: s.publicMarket.filter((c) => c.id !== cardId),
    blackMarket: s.blackMarket.filter((c) => c.id !== cardId),
  };
  s = log(s, `${player.name} purchased ${card.name} for $${cost}.`);

  // Disguise: draw 2 cards on purchase (rulebook p.16).
  if (card.name === 'Disguise') {
    s = drawForPlayer(s, idx);
    s = drawForPlayer(s, idx);
    s = log(s, `${player.name} draws 2 cards from the Disguise.`);
  }
  // Coffee Machine: hands its buyer an active Coffee token (rulebook p.13).
  if (card.name === 'Coffee Machine') {
    s = updatePlayer(s, idx, (p) => ({ ...p, coffeeToken: true }));
    s = log(s, `${player.name} brews a Coffee token.`);
  }

  // Expand Network (and any vp-bearing card) scores instantly for the buyer's team.
  if (card.vpValue) {
    s = applyScore(s, player.team, card.vpValue, `${player.name} scored ${card.vpValue} VP from ${card.name}.`);
    if (player.team === 'CRIMINAL') s = triggerVigilante(s);
  }
  // Replace the bought card from the top of the matching market deck.
  s = refillMarkets(s);
  return { state: s, ok: true };
}

function expose(
  state: GameState,
  idx: number,
  player: Player,
  targetId: string,
  evidenceChoices: Partial<Record<EvidenceCategory, string>> = {},
): GameState {
  if (player.team !== 'CIVILIAN') return log(state, 'Only Civilians can Expose.');
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
  if (!isGridComplete(state.evidenceGrid)) return log(state, 'The Evidence grid is not complete.');

  const targetIndex = playerIndexById(state, targetId);
  const target = state.players[targetIndex];
  if (!target || target.team !== 'CRIMINAL') return log(state, 'You can only Expose a Criminal.');
  if (target.isCaptured) return log(state, 'That Criminal is already captured.');
  if (target.isExposed) return log(state, 'That Criminal is already exposed.');
  if (target.inventory.some((c) => c.name === 'Disguise')) {
    return log(state, `${target.name} is disguised and cannot be Exposed.`);
  }

  // Spend exactly 1 card from each category — the exposer's choice when a
  // category holds more than one; any others stay in the grid for next time.
  const categories = Object.keys(state.evidenceGrid) as EvidenceCategory[];
  let grid = state.evidenceGrid;
  const spent: ActionCard[] = [];
  for (const cat of categories) {
    const slot = grid[cat];
    const chosenId = evidenceChoices[cat];
    const card = slot.cards.find((c) => c.id === chosenId) ?? slot.cards[0];
    spent.push(card);
    grid = { ...grid, [cat]: { cards: slot.cards.filter((c) => c.id !== card.id) } };
  }

  let s: GameState = { ...state, evidenceGrid: grid, discardPile: [...state.discardPile, ...spent] };
  s = updatePlayer(s, idx, (p) => ({ ...p, actionsRemaining: p.actionsRemaining - 1 }));
  s = updatePlayer(s, targetIndex, (p) => ({ ...p, isExposed: true, powerLevel: p.powerLevel - 1 }));
  return applyScore(s, 'CIVILIAN', 1, `${player.name} exposed ${target.name}! Civilians score a VP.`);
}

/**
 * Initiate combat (rulebook p.8). Validates the target, spends the attacker's
 * actions, resolves pre-combat weapon effects, computes both base powers, and
 * opens the interactive Power phase (`state.combat`). The fight is then driven
 * by PLAY_POWER / COMBAT_DISCARD_MONEY / PASS_COMBAT and resolved by
 * resolveCombat() once both sides pass.
 */
function attack(state: GameState, idx: number, player: Player, targetId: string): GameState {
  if (state.combat) return log(state, 'A combat is already in progress.');
  if (player.hasAttacked) return log(state, `${player.name} already attacked this turn.`);

  const targetIndex = playerIndexById(state, targetId);
  const target = state.players[targetIndex];
  if (!target) return log(state, 'No such target.');

  const err = attackError(state, idx, target);
  if (err) return log(state, err);

  const cost = attackActionCost(player, target);
  if (player.actionsRemaining < cost) return log(state, `Combat costs ${cost} action(s).`);

  // Commit: spend actions and mark the once-per-turn attack.
  let s = updatePlayer(state, idx, (p) => ({
    ...p,
    actionsRemaining: p.actionsRemaining - cost,
    hasAttacked: true,
  }));
  s = log(s, `${player.name} attacks ${target.name}! (${cost} action${cost === 1 ? '' : 's'})`);

  // Deterministic pre-combat weapon effects (draw/discard/steal).
  s = resolvePreCombat(s, player.id, target.id);
  const atk = s.players[playerIndexById(s, player.id)];
  const def = s.players[playerIndexById(s, target.id)];
  const playerCount = s.players.length;

  // Interactive pre-combat choices (Portal / Drones / Mutants / Pistol) are resolved in
  // the PRE phase before base powers are known; otherwise open the Power phase.
  const pending = buildPendingChoices(s, atk.id, def.id);
  const combat: CombatState = {
    attacker: { playerId: atk.id, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
    defender: { playerId: def.id, basePower: 0, powerCardBonus: 0, passed: false, canPlayPower: true },
    turn: 'ATTACKER',
    played: [],
    actionCost: cost,
    playerCount,
    phase: pending.length > 0 ? 'PRE' : 'POWER',
    pending,
  };
  s = { ...s, combat };
  if (pending.length > 0) {
    return log(s, `${atk.name} attacks ${def.name}. Resolve pre-combat weapon choices.`);
  }
  return enterPowerPhase(s);
}

/** The CombatParticipant on a given side, and its opposite. */
function sideParts(combat: CombatState, side: CombatSide) {
  return side === 'ATTACKER'
    ? { self: combat.attacker, other: combat.defender }
    : { self: combat.defender, other: combat.attacker };
}

/** Rebuild a CombatState after mutating one side's participant. */
function withSide(
  combat: CombatState,
  side: CombatSide,
  self: CombatState['attacker'],
  other: CombatState['attacker'],
): CombatState {
  return side === 'ATTACKER'
    ? { ...combat, attacker: self, defender: other }
    : { ...combat, defender: self, attacker: other };
}

/**
 * Play a Power card during the Power phase. `side` is the combatant it boosts;
 * `byPlayerId` (default: that combatant) is whose hand it comes from. Enforces
 * the card restrictions: Shield is defence-only, Unexpected Allies must be
 * played by a teammate (never for yourself), and other teammates may only play
 * for a combatant if they are that combatant's Bodyguard.
 */
function playPower(
  state: GameState,
  cardId: string,
  side: CombatSide,
  byPlayerId: string | undefined,
  mirrorTargetCardId: string | undefined,
): GameState {
  const combat = state.combat;
  if (!combat) return log(state, 'No combat in progress.');
  if (combat.phase !== 'POWER') return log(state, 'Resolve the pre-combat choices first.');

  const { self, other } = sideParts(combat, side);
  if (!self.canPlayPower) return log(state, 'A Signal Jammer prevents this side from playing Power cards.');

  const combatantIdx = playerIndexById(state, self.playerId);
  const combatant = state.players[combatantIdx];
  const byId = byPlayerId ?? combatant.id;
  const byIdx = playerIndexById(state, byId);
  const by = state.players[byIdx];
  if (!by) return log(state, 'No such player.');

  const card = by.hand.find((c) => c.id === cardId);
  if (!card || card.type !== 'POWER') return log(state, 'That is not a Power card in that hand.');

  // Who may play what for whom (Shield/Unexpected Allies/Bodyguard/Mirror).
  const eligibility = powerCardEligible(card, by, combatant, side, combat.played);
  if (!eligibility.enabled) return log(state, eligibility.reason ?? 'You cannot play that Power card here.');
  if (card.name === 'Mirror' && mirrorTargetCardId) {
    const validTarget = combat.played.some((p) => p.cardId === mirrorTargetCardId && p.byPlayerId !== by.id);
    if (!validTarget) return log(state, 'Choose one of the already-played Power cards to copy.');
  }

  const { basePower, power, copiedCardName } = powerCardValue(card, by, combat.played, mirrorTargetCardId);

  // Discard the card from its owner's hand.
  let s = updatePlayer(state, byIdx, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== cardId) }));
  s = { ...s, discardPile: [...s.discardPile, card] };

  const newSelf = { ...self, powerCardBonus: self.powerCardBonus + power, passed: false };
  const newOther = { ...other, passed: false };
  let newCombat = withSide(combat, side, newSelf, newOther);
  newCombat = {
    ...newCombat,
    turn: otherSide(side),
    played: [...combat.played, { cardId, name: card.name, byPlayerId: by.id, side, power, basePower }],
  };
  s = { ...s, combat: newCombat };
  const message =
    card.name === 'Mirror' && copiedCardName
      ? `${by.name} used Mirror to copy ${copiedCardName} to get +${power} PL.`
      : `${by.name} plays ${card.name} for ${power} power on ${side === 'ATTACKER' ? 'attack' : 'defence'}.`;
  return log(s, message);
}

/**
 * Machine Gun: during the Power phase its holder may discard any number of
 * Money cards, each adding +1 power to their side.
 */
function combatDiscardMoney(state: GameState, side: CombatSide, cardIds: string[]): GameState {
  const combat = state.combat;
  if (!combat) return log(state, 'No combat in progress.');
  if (combat.phase !== 'POWER') return log(state, 'Resolve the pre-combat choices first.');

  const { self, other } = sideParts(combat, side);
  const pIdx = playerIndexById(state, self.playerId);
  const p = state.players[pIdx];
  if (!hasItem(p, 'Machine Gun')) return log(state, `${p.name} has no Machine Gun.`);

  const money = p.hand.filter((c) => cardIds.includes(c.id) && c.type === 'MONEY');
  if (money.length === 0) return log(state, 'No Money cards to discard.');

  const moneyIds = new Set(money.map((c) => c.id));
  let s = updatePlayer(state, pIdx, (pl) => ({ ...pl, hand: pl.hand.filter((c) => !moneyIds.has(c.id)) }));
  s = { ...s, discardPile: [...s.discardPile, ...money] };

  const newSelf = { ...self, powerCardBonus: self.powerCardBonus + money.length, passed: false };
  const newOther = { ...other, passed: false };
  const newCombat = { ...withSide(combat, side, newSelf, newOther), turn: otherSide(side) };
  s = { ...s, combat: newCombat };
  return log(s, `${p.name}'s Machine Gun discards ${money.length} Money card(s) for +${money.length} power.`);
}

/**
 * Pass in the Power phase. When both sides have passed consecutively the fight
 * resolves; a Criminal VP from the result triggers the Vigilante(s).
 */
function passCombat(state: GameState, side: CombatSide): GameState {
  const combat = state.combat;
  if (!combat) return log(state, 'No combat in progress.');
  if (combat.phase !== 'POWER') return log(state, 'Resolve the pre-combat choices first.');

  const { self, other } = sideParts(combat, side);
  const newSelf = { ...self, passed: true };
  const newCombat = { ...withSide(combat, side, newSelf, other), turn: otherSide(side) };
  let s = log({ ...state, combat: newCombat }, `${state.players[playerIndexById(state, self.playerId)].name} passes.`);

  if (newCombat.attacker.passed && newCombat.defender.passed) {
    const before = s.teamScores.CRIMINAL;
    s = resolveCombat(s);
    if (s.teamScores.CRIMINAL > before) s = triggerVigilante(s);
  }
  return s;
}

/**
 * Resolve the current player's role Action (rulebook p.17). Every ability costs
 * 1 action, may be used once per turn, and is unavailable to injured/captured
 * players. Passive roles (Mayor, Attorney, Vigilante, Hitman, Spy, Nurse) have
 * no Action and are handled elsewhere (turn/combat hooks); calling this on one
 * is a no-op with an explanatory log. Nurse's Triage in particular is a
 * genuine out-of-turn reaction, resolved as a NURSE_HEAL combat choice (see
 * findAvailableNurse in combat.ts) rather than through this function.
 */
function applyRoleAbility(
  state: GameState,
  idx: number,
  player: Player,
  payload: RoleAbilityPayload,
  opts: { roleId?: string; free?: boolean } = {},
): GameState {
  // `free` (Ally Support) runs another role's action for the actor without the
  // normal action cost or once-per-turn gate; `roleId` overrides which role's
  // Action resolves (defaults to the actor's own).
  const roleId = opts.roleId ?? player.role.id;
  if (!opts.free) {
    if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
    if (player.hasUsedRoleAbility) return log(state, `${player.name} already used a role ability this turn.`);
    if (player.isInjured || player.isCaptured) {
      return log(state, `${player.name} cannot use a role ability while injured or captured.`);
    }
  }

  const { cardId, targetId, category, gridCardId, mode } = payload;
  const targetIndex = targetId != null ? playerIndexById(state, targetId) : -1;
  const target = targetIndex >= 0 ? state.players[targetIndex] : undefined;

  /** Mark the ability used and spend its single action (no-op when free). */
  const spend = (s: GameState) =>
    opts.free
      ? s
      : updatePlayer(s, idx, (p) => ({
          ...p,
          actionsRemaining: p.actionsRemaining - 1,
          hasUsedRoleAbility: true,
        }));

  switch (roleId) {
    // --- Civilians -----------------------------------------------------------
    case 'collector': {
      // Commission: buy a perk/weapon, then collect $1.
      const { state: s, ok } = doPurchase(state, idx, player, cardId ?? '', {
        spendAction: false,
        setPurchaseFlag: false,
      });
      if (!ok) return s;
      const out = updatePlayer(spend(s), idx, (p) => ({ ...p, money: p.money + 1 }));
      return log(out, `${player.name} (Collector) buys and collects $1 commission.`);
    }

    case 'sheriff': {
      // Subpoena: force an opponent to reveal their Evidence cards. The
      // action is spent on targeting alone (win or lose) — if they have none,
      // it's wasted immediately; otherwise the card+category choice is a
      // separate step (see pendingSheriff/resolveSheriff) so the reveal can
      // survive online redaction the same way lastPeek does.
      if (!target || target.team === player.team) return log(state, 'Sheriff must target an opponent.');
      const evidenceCards = target.hand.filter((c) => c.type === 'EVIDENCE');
      const spent = spend(state);
      if (evidenceCards.length === 0) {
        return log(spent, `${target.name} has no Evidence cards — the Action is wasted.`);
      }
      const s = { ...spent, pendingSheriff: { sheriffId: player.id, targetId: target.id, cards: evidenceCards } };
      return log(s, `${player.name} (Sheriff) subpoenas ${target.name}.`);
    }

    case 'bodyguard': {
      // Protection: move the Bodyguard token to a Civilian teammate.
      if (!target || target.team !== 'CIVILIAN') return log(state, 'Bodyguard must protect a Civilian teammate.');
      const s = {
        ...state,
        players: state.players.map((p) => ({ ...p, hasBodyguardToken: p.id === target.id })),
      };
      return log(spend(s), `${player.name} (Bodyguard) gives Protection to ${target.name}.`);
    }

    case 'witness': {
      // Testimony: pick any Evidence card out of the discard pile and give it to a teammate.
      if (!target || target.team !== 'CIVILIAN' || target.id === player.id) {
        return log(state, 'Witness must give the card to a Civilian teammate.');
      }
      const card = state.discardPile.find((c) => c.id === cardId && c.type === 'EVIDENCE');
      if (!card) return log(state, 'That Evidence card is not in the discard pile.');
      let s: GameState = { ...state, discardPile: state.discardPile.filter((c) => c.id !== cardId) };
      s = updatePlayer(s, targetIndex, (p) => ({ ...p, hand: [...p.hand, card] }));
      return log(spend(s), `${player.name} (Witness) pulls ${card.name} from the discard and gives it to ${target.name}.`);
    }

    // --- Criminals -----------------------------------------------------------
    case 'crime-lord': {
      // Connections: buy Expand Network for $1 less.
      const card = state.blackMarket.find((c) => c.id === cardId);
      if (!card || card.type !== 'SPECIAL') return log(state, 'Crime Lord must target Expand Network in the Black Market.');
      const { state: s, ok } = doPurchase(state, idx, player, cardId ?? '', {
        spendAction: false,
        setPurchaseFlag: false,
        costDelta: -1,
      });
      if (!ok) return s;
      return log(spend(s), `${player.name} (Crime Lord) uses Connections.`);
    }

    case 'evil-scientist': {
      // Experiment: buy a Tech/Chemical weapon at a $1 discount, then draw.
      const { state: s, ok } = doPurchase(state, idx, player, cardId ?? '', {
        spendAction: false,
        setPurchaseFlag: false,
        costDelta: -1,
        requireWeaponType: ['TECH', 'CHEMICAL'],
      });
      if (!ok) return s;
      const out = drawForPlayer(spend(s), idx);
      return log(out, `${player.name} (Evil Scientist) buys and draws a card.`);
    }

    case 'robber': {
      // Pickpocket: steal $1 (Civilian with $3+) or a card (Civilian with 3+ cards).
      if (!target || target.team !== 'CIVILIAN') return log(state, 'Robber must target a Civilian.');
      if (mode === 'CARD') {
        if (target.hand.length < 3) return log(state, 'That Civilian does not have 3+ cards.');
        const stolen = target.hand[0];
        let s = updatePlayer(state, targetIndex, (p) => ({ ...p, hand: p.hand.slice(1) }));
        s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, stolen] }));
        return log(spend(s), `${player.name} (Robber) steals a card from ${target.name}.`);
      }
      if (target.money < 3) return log(state, 'That Civilian does not have $3+.');
      let s = updatePlayer(state, targetIndex, (p) => ({ ...p, money: p.money - 1 }));
      s = updatePlayer(s, idx, (p) => ({ ...p, money: p.money + 1 }));
      return log(spend(s), `${player.name} (Robber) steals $1 from ${target.name}.`);
    }

    case 'arsonist': {
      // Threaten: an opponent discards 1 card or loses $1 — their choice, made
      // via RESOLVE_THREATEN once this sets pendingThreaten (see resolveThreaten).
      if (!target || target.team === player.team) return log(state, 'Arsonist must target an opponent.');
      const canMoney = target.money > 0;
      const canDiscard = target.hand.length > 0;
      if (!canMoney && !canDiscard) return log(state, `${target.name} has nothing to lose.`);
      const s = { ...spend(state), pendingThreaten: { targetId: target.id } };
      return log(s, `${player.name} (Arsonist) threatens ${target.name}, who must lose $1 or discard a card.`);
    }

    case 'smuggler': {
      // Contraband: move a Market card into the Black Market, $1 cheaper.
      const card = state.publicMarket.find((c) => c.id === cardId);
      if (!card) return log(state, 'Smuggler must choose a card in the public Market.');
      const moved: MarketCard = {
        ...card,
        source: 'BLACK_MARKET',
        cost: Math.max(0, card.cost - 1),
        smuggled: true,
        originalCost: card.cost,
      };
      let s: GameState = {
        ...state,
        publicMarket: state.publicMarket.filter((c) => c.id !== cardId),
        blackMarket: [...state.blackMarket, moved],
      };
      // The vacated public slot refills; the moved card is an extra black-market offer.
      s = refillMarkets(s);
      return log(spend(s), `${player.name} (Smuggler) moves ${card.name} to the Black Market for $1 less.`);
    }

    case 'forger': {
      // Fabricate: discard a hand Evidence to remove same-category grid Evidence
      // — the Forger's choice of which, when more than one has piled up there.
      const card = player.hand.find((c) => c.id === cardId);
      if (!card || card.type !== 'EVIDENCE') return log(state, 'Forger must discard an Evidence card from hand.');
      if (!category || !card.evidenceCategories?.includes(category)) return log(state, `${card.name} is not ${category} evidence.`);
      const slot = state.evidenceGrid[category];
      if (slot.cards.length === 0) return log(state, `${category} has no evidence to discard.`);
      const removed = slot.cards.find((c) => c.id === gridCardId) ?? slot.cards[0];
      let s = updatePlayer(state, idx, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== cardId) }));
      s = {
        ...s,
        discardPile: [...s.discardPile, card, removed],
        evidenceGrid: { ...s.evidenceGrid, [category]: { cards: slot.cards.filter((c) => c.id !== removed.id) } },
      };
      return log(spend(s), `${player.name} (Forger) fabricates away ${removed.name} from ${category}.`);
    }

    default:
      return log(state, `${player.role.name} has no active role Action.`);
  }
}

/**
 * Move one TradeItem from `from` to `to`, returning the updated pair or an
 * error. Enforces the 2-weapon cap on the receiver; perks are not tradeable.
 */
function applyTradeItem(
  from: Player,
  to: Player,
  item: TradeItem,
): { ok: true; from: Player; to: Player } | { ok: false; error: string } {
  if (item.kind === 'MONEY') {
    if (from.money < 1) return { ok: false, error: `${from.name} has no money to trade.` };
    return { ok: true, from: { ...from, money: from.money - 1 }, to: { ...to, money: to.money + 1 } };
  }
  if (item.kind === 'CARD') {
    const card = from.hand.find((c) => c.id === item.cardId);
    if (!card) return { ok: false, error: `${from.name} does not hold that card.` };
    return {
      ok: true,
      from: { ...from, hand: from.hand.filter((c) => c.id !== item.cardId) },
      to: { ...to, hand: [...to.hand, card] },
    };
  }
  const w = from.inventory.find((c) => c.id === item.cardId && c.type === 'WEAPON');
  if (!w) return { ok: false, error: `${from.name} does not own that weapon.` };
  if (to.inventory.filter((c) => c.type === 'WEAPON').length >= MAX_WEAPONS) {
    return { ok: false, error: `${to.name} already has 2 weapons.` };
  }
  return {
    ok: true,
    from: { ...from, inventory: from.inventory.filter((c) => c.id !== item.cardId) },
    to: { ...to, inventory: [...to.inventory, w] },
  };
}

/**
 * A trade gift's case-log label — the card's identity stays private (never
 * written to the shared log), but a weapon's name and $1 are public.
 */
function tradeGiftLabel(giver: Player, item: TradeItem): string {
  if (item.kind === 'MONEY') return '$1';
  if (item.kind === 'WEAPON') {
    const w = giver.inventory.find((c) => c.id === item.cardId);
    return w ? w.name : 'a weapon';
  }
  return 'a card';
}

/**
 * Trade with a teammate (rulebook p.7): the initiator gives one money/card/
 * weapon; the teammate then must give one back — their own choice, not the
 * initiator's (see resolveTradeReturn). Costs 1 action, +1 if either party
 * holds a Traffic token ("trading with this player costs 2 actions" — the
 * token snarls the holder regardless of whether they initiate or receive),
 * −1 (once per turn) if the trader has a Radio.
 */
function initiateTrade(
  state: GameState,
  idx: number,
  player: Player,
  targetId: string,
  give: TradeItem,
): GameState {
  const ti = playerIndexById(state, targetId);
  const mate = state.players[ti];
  if (!mate || ti === idx) return log(state, 'Choose a teammate to trade with.');
  if (mate.team !== player.team) return log(state, 'You can only trade with a teammate.');

  const usesRadio = player.inventory.some((c) => c.name === 'Radio') && !player.hasUsedRadio;
  const trafficSnarled = player.trafficToken || mate.trafficToken;
  const cost = Math.max(0, 1 + (trafficSnarled ? 1 : 0) - (usesRadio ? 1 : 0));
  if (player.actionsRemaining < cost) return log(state, `Trading costs ${cost} action(s).`);

  const moved = applyTradeItem(player, mate, give);
  if (!moved.ok) return log(state, moved.error);

  let s = updatePlayer(state, idx, () => ({
    ...moved.from,
    actionsRemaining: moved.from.actionsRemaining - cost,
    hasUsedRadio: usesRadio ? true : moved.from.hasUsedRadio,
  }));
  s = updatePlayer(s, ti, () => moved.to);
  s = log(s, `${player.name} trades ${tradeGiftLabel(player, give)} to ${mate.name}.`);
  return { ...s, pendingTrade: { initiatorId: player.id, recipientId: mate.id } };
}

/**
 * The teammate's half of a trade: give one item back to the initiator (their
 * own choice), or `null` if they truly have nothing to give. Express
 * Shipping — "after you trade, during your own turn's Trade action"
 * (rulebook clarification) — pays out only to the *initiator*, never the
 * teammate, and only once the whole trade is done; see resolveExpressShipping
 * for the $1-or-draw choice that follows.
 */
function resolveTradeReturn(state: GameState, give: TradeItem | null): GameState {
  const pending = state.pendingTrade;
  if (!pending) return state;
  const initIdx = playerIndexById(state, pending.initiatorId);
  const recIdx = playerIndexById(state, pending.recipientId);
  const initiator = state.players[initIdx];
  const recipient = state.players[recIdx];
  if (!initiator || !recipient) return { ...state, pendingTrade: null };

  let s: GameState;
  if (!give) {
    s = log(state, `${recipient.name} has nothing to trade back.`);
  } else {
    const moved = applyTradeItem(recipient, initiator, give);
    if (!moved.ok) return log(state, moved.error); // stays pending — let them pick again
    s = updatePlayer(state, recIdx, () => moved.from);
    s = updatePlayer(s, initIdx, () => moved.to);
    s = log(s, `${recipient.name} trades ${tradeGiftLabel(recipient, give)} to ${initiator.name}.`);
  }

  s = { ...s, pendingTrade: null };
  if (initiator.inventory.some((c) => c.name === 'Express Shipping')) {
    s = log(s, `${initiator.name}'s Express Shipping triggers — choose $1 or draw a card.`);
    s = { ...s, pendingExpressShipping: { playerId: initiator.id } };
  }
  return s;
}

/** Express Shipping's payout: $1, or a card draw — the owner's choice, never both. */
function resolveExpressShipping(state: GameState, mode: 'MONEY' | 'DRAW'): GameState {
  const pending = state.pendingExpressShipping;
  if (!pending) return state;
  const idx = playerIndexById(state, pending.playerId);
  const player = state.players[idx];
  if (!player) return { ...state, pendingExpressShipping: null };

  let s: GameState;
  if (mode === 'DRAW') {
    s = log(gameReducerDraw(state), `${player.name}'s Express Shipping draws a card.`);
  } else {
    s = log(updatePlayer(state, idx, (p) => ({ ...p, money: p.money + 1 })), `${player.name}'s Express Shipping pays $1.`);
  }
  return { ...s, pendingExpressShipping: null };
}

/**
 * Resolve an "Action:" perk (rulebook p.6, p.13-15). Each costs 1 action and is
 * usable once per turn; Water Bottle is the exception (a free discard for an
 * extra action).
 */
function applyPerk(
  state: GameState,
  idx: number,
  player: Player,
  perkId: string,
  payload: PerkPayload,
  opts: { perk?: MarketCard; free?: boolean } = {},
): GameState {
  // `opts.perk` (Ally Support) runs a teammate's perk action for the actor;
  // `opts.free` waives the action cost / once-per-turn gate and skips consuming
  // a perk the actor doesn't own.
  const perk = opts.perk ?? player.inventory.find((c) => c.id === perkId);
  if (!perk) return log(state, 'You do not own that perk.');
  const ownsPerk = player.inventory.some((c) => c.id === perk.id);
  // Unlike a role ability or combat, injured/captured players may still use
  // perk Actions (Bank, Credit Card, Shady Press, etc.) — the rulebook only
  // strips their role ability and their ability to attack/be attacked.

  // Water Bottle: discard for an extra action (no action cost to use).
  if (perk.name === 'Water Bottle') {
    const s = updatePlayer(state, idx, (p) => ({
      ...p,
      inventory: ownsPerk ? p.inventory.filter((c) => c.id !== perk.id) : p.inventory,
      actionsRemaining: p.actionsRemaining + 1,
    }));
    return log(s, `${player.name} drinks a Water Bottle for an extra action.`);
  }

  // Journal: discard to repeat the most recently played Event (reactive, free).
  if (perk.name === 'Journal') {
    const fromTop = [...state.discardPile].reverse().findIndex((c) => c.type === 'EVENT');
    if (fromTop < 0) return log(state, 'No Event has been played to repeat with the Journal.');
    const evt = state.discardPile[state.discardPile.length - 1 - fromTop];
    let s = ownsPerk
      ? updatePlayer(state, idx, (p) => ({ ...p, inventory: p.inventory.filter((c) => c.id !== perk.id) }))
      : state;
    s = resolveEvent(s, idx, evt.name, payload.targetId, { marketCardId: payload.marketCardId });
    return log(s, `${player.name} uses their Journal to repeat ${evt.name}.`);
  }

  if (!opts.free) {
    if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
    if (player.usedPerkIds?.includes(perk.id)) return log(state, `${perk.name} was already used this turn.`);
  }

  const spend = (s: GameState) =>
    opts.free
      ? s
      : updatePlayer(s, idx, (p) => ({
          ...p,
          actionsRemaining: p.actionsRemaining - 1,
          usedPerkIds: [...(p.usedPerkIds ?? []), perk.id],
        }));

  switch (perk.name) {
    case 'Bank': {
      const card = player.hand.find((c) => c.id === payload.cardId && c.type === 'MONEY');
      if (!card) return log(state, 'Bank needs a Money card from your hand.');
      const gain = (card.value ?? 0) + 1;
      let s = updatePlayer(state, idx, (p) => ({ ...p, money: p.money + gain, hand: p.hand.filter((c) => c.id !== card.id) }));
      s = { ...s, discardPile: [...s.discardPile, card] };
      s = gameReducerDraw(s);
      return log(spend(s), `${player.name}'s Bank plays ${card.name} for $${gain} and draws a card.`);
    }
    case 'Credit Card': {
      // The $2-off mode only applies when the actor actually owns the card to discard.
      const discard = Boolean(payload.discardForBonus) && ownsPerk;
      const costDelta = discard ? -2 : -1;
      const base = discard
        ? updatePlayer(state, idx, (p) => ({ ...p, inventory: p.inventory.filter((c) => c.id !== perk.id) }))
        : state;
      const { state: s, ok } = doPurchase(base, idx, base.players[idx], payload.marketCardId ?? '', {
        spendAction: false,
        setPurchaseFlag: false,
        costDelta,
      });
      if (!ok) return s;
      return log(spend(s), `${player.name} uses a Credit Card for a $${discard ? 2 : 1} discount.`);
    }
    case 'Recycling Bin': {
      const disc = player.hand.find((c) => c.id === payload.cardId);
      if (!disc) return log(state, 'Recycling Bin needs a card from your hand to discard.');
      const fromTop = [...state.discardPile].reverse().findIndex((c) => c.type === disc.type);
      if (fromTop < 0) return log(state, `No ${disc.type} card in the discard to recover.`);
      const realIndex = state.discardPile.length - 1 - fromTop;
      const taken = state.discardPile[realIndex];
      let s = updatePlayer(state, idx, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== disc.id) }));
      s = { ...s, discardPile: [...state.discardPile.filter((_, i) => i !== realIndex), disc] };
      s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, taken], money: p.money + 1 }));
      return log(spend(s), `${player.name} recycles ${disc.name} for ${taken.name} and $1.`);
    }
    case 'Hacked Passwords': {
      const ti = payload.targetId ? playerIndexById(state, payload.targetId) : -1;
      const victim = state.players[ti];
      if (!victim || ti === idx) return log(state, 'Choose another player to hack.');
      if (victim.hand.length === 0) return log(state, `${victim.name} has no cards to steal.`);
      const stolen = victim.hand[0];
      let s = updatePlayer(state, ti, (p) => ({ ...p, hand: p.hand.slice(1) }));
      s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, stolen] }));
      return log(spend(s), `${player.name}'s Hacked Passwords steals a card from ${victim.name}.`);
    }
    case 'Alarm Clock': {
      const evt = player.hand.find((c) => c.id === payload.cardId && c.type === 'EVENT');
      if (!evt) return log(state, 'Alarm Clock needs an Event card from your hand.');
      let s = updatePlayer(state, idx, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== evt.id) }));
      s = { ...s, discardPile: [...s.discardPile, evt] };
      s = resolveEvent(s, idx, evt.name, payload.targetId, {});
      s = gameReducerDraw(s);
      s = updatePlayer(s, idx, (p) => ({ ...p, money: p.money + 1 }));
      return log(spend(s), `${player.name}'s Alarm Clock plays ${evt.name}, then draws and gains $1.`);
    }
    case 'Coffee Machine': {
      // Replenish the Coffee token, optionally moving it to a teammate.
      const holderIndex = payload.targetId ? playerIndexById(state, payload.targetId) : idx;
      const holder = state.players[holderIndex];
      if (!holder || holder.team !== player.team) return log(state, 'Coffee can only go to you or a teammate.');
      const s = updatePlayer(state, holderIndex, (p) => ({ ...p, coffeeToken: true }));
      return log(spend(s), `${player.name} refreshes the Coffee token for ${holder.name}.`);
    }
    case 'Trash Can': {
      // Buy a binned card from the trash pile at a $1 discount.
      const pile = state.trashPile ?? [];
      const card = pile.find((c) => c.id === payload.marketCardId);
      if (!card) return log(state, 'That card is not in the trash can.');
      const cost = Math.max(0, card.cost - 1);
      if (player.money < cost) return log(state, `${player.name} cannot afford ${card.name}.`);
      const perks = player.inventory.filter((c) => c.type !== 'WEAPON').length;
      const weapons = player.inventory.filter((c) => c.type === 'WEAPON').length;
      if (card.type === 'WEAPON' && weapons >= MAX_WEAPONS) return log(state, 'You already have 2 weapons.');
      if (card.type !== 'WEAPON' && perks >= MAX_PERKS) return log(state, 'You already have 4 perks.');
      let s = updatePlayer(state, idx, (p) => ({ ...p, money: p.money - cost, inventory: [...p.inventory, card] }));
      s = { ...s, trashPile: pile.filter((c) => c.id !== card.id) };
      return log(spend(s), `${player.name} buys ${card.name} from the trash can for $${cost}.`);
    }
    case 'Manipulate': {
      // Look at the top 3: take the top card, discard the next, keep the third on top.
      if (state.drawPile.length === 0) return log(state, 'The deck is empty.');
      const take = state.drawPile[0];
      const drop = state.drawPile[1]; // undefined if the deck is nearly empty
      let s: GameState = {
        ...state,
        drawPile: state.drawPile.slice(2),
        discardPile: drop ? [...state.discardPile, drop] : state.discardPile,
      };
      s = updatePlayer(s, idx, (p) => ({ ...p, hand: [...p.hand, take] }));
      return log(spend(s), `${player.name} uses Manipulate on the top of the deck.`);
    }
    case 'Shady Press': {
      // Choose an opponent, see all their Event cards, and force one to be
      // played immediately — for the Criminal's benefit, same as Sheriff's
      // Subpoena forces an opponent's Evidence card into play for the Sheriff.
      // If the victim holds none, the action is still spent — "nothing
      // happens" (rulebook), not a free retry.
      const ti = payload.targetId ? playerIndexById(state, payload.targetId) : -1;
      const victim = state.players[ti];
      if (!victim || victim.team === player.team) return log(state, 'Shady Press must target an opponent.');
      const events = victim.hand.filter((c) => c.type === 'EVENT');
      if (events.length === 0) {
        return log(spend(state), `${victim.name} has no Event cards — the Action is wasted.`);
      }
      const evt = events.find((c) => c.id === payload.cardId);
      if (!evt) return log(state, `Choose one of ${victim.name}'s Event cards to play.`);
      let s = updatePlayer(state, ti, (p) => ({ ...p, hand: p.hand.filter((c) => c.id !== evt.id) }));
      s = { ...s, discardPile: [...s.discardPile, evt] };
      s = resolveEvent(s, idx, evt.name, payload.eventTargetId, payload.eventOptions ?? {});
      return log(spend(s), `${player.name}'s Shady Press plays ${victim.name}'s ${evt.name}.`);
    }
    default:
      return log(state, `${perk.name} has no automated Action (resolve manually).`);
  }
}

/** Pay $1 and an action to discard a Traffic token (rulebook p.11). */
function clearTraffic(state: GameState, idx: number, player: Player): GameState {
  if (!player.trafficToken) return log(state, `${player.name} has no Traffic token.`);
  if (player.actionsRemaining < 1) return log(state, `${player.name} has no actions left.`);
  if (player.money < 1) return log(state, `${player.name} cannot afford to clear the Traffic token.`);
  const s = updatePlayer(state, idx, (p) => ({
    ...p,
    trafficToken: false,
    money: p.money - 1,
    actionsRemaining: p.actionsRemaining - 1,
  }));
  return log(s, `${player.name} pays $1 to clear their Traffic token.`);
}

function endTurn(state: GameState, idx: number): GameState {
  // An unused Spring Cleaning discount is forfeit once the turn ends.
  const finishing = state.players[idx];
  const clearedDiscount =
    finishing && state.pendingMarketDiscount?.playerId === finishing.id ? null : state.pendingMarketDiscount;

  // Reset the finishing player's per-turn flags and heal them if injured.
  let s: GameState = { ...state, pendingMarketDiscount: clearedDiscount };
  s = updatePlayer(s, idx, (p) => ({
    ...p,
    hasPurchasedFromMarket: false,
    hasUsedRoleAbility: false,
    hasAttacked: false,
    hasUsedRadio: false,
    usedPerkIds: [],
    isInjured: p.team === 'CIVILIAN' ? false : p.isInjured,
  }));

  const nextIndex = (idx + 1) % s.players.length;
  s = updatePlayer(s, nextIndex, (p) => ({ ...p, actionsRemaining: actionsForTurn(p) }));
  s = { ...s, currentPlayerIndex: nextIndex };
  s = applyStartOfTurn(s, nextIndex);
  return log(s, `${s.players[nextIndex].name}'s turn.`);
}

/**
 * Resolve passive start-of-turn effects for the player whose turn begins: virus
 * tokens (−1 action), Computer / Laboratory (draw), Investment / Ironworks
 * (gain $1), Corrupt Connections (+1 action), the Vitamin tracker, and
 * shedding a Disguise. The Coffee token is follow-up work. (The Spy's Recon
 * isn't turn-start — it's live for the whole turn; see withSpyPeek.)
 */
function applyStartOfTurn(state: GameState, index: number): GameState {
  const player = state.players[index];
  if (!player) return state;
  const has = (name: string) => player.inventory.some((c) => c.name === name);

  let s: GameState = state;

  // Virus tokens (from the Viruses weapon) cost 1 action each, then clear.
  if ((player.virusTokens ?? 0) > 0) {
    const tokens = player.virusTokens ?? 0;
    s = updatePlayer(s, index, (p) => ({
      ...p,
      actionsRemaining: Math.max(0, p.actionsRemaining - tokens),
      virusTokens: 0,
    }));
    s = log(s, `${player.name} loses ${tokens} action(s) to Virus token(s).`);
  }

  if (has('Computer')) {
    s = gameReducerDraw(s);
    s = log(s, `${player.name}'s Computer draws a card.`);
  }
  if (has('Laboratory')) {
    s = gameReducerDraw(s);
    s = log(s, `${player.name}'s Laboratory draws a card.`);
  }
  const income = (has('Investment') ? 1 : 0) + (has('Ironworks') ? 1 : 0);
  if (income > 0) {
    s = updatePlayer(s, index, (p) => ({ ...p, money: p.money + income }));
    s = log(s, `${player.name} gains $${income} from perks.`);
  }
  if (has('Corrupt Connections')) {
    s = updatePlayer(s, index, (p) => ({ ...p, actionsRemaining: p.actionsRemaining + 1 }));
    s = log(s, `${player.name}'s Corrupt Connections grants an extra action.`);
  }

  // Coffee token: +1 action and a draw, then the token is spent (rulebook p.13).
  if (player.coffeeToken) {
    s = updatePlayer(s, index, (p) => ({ ...p, actionsRemaining: p.actionsRemaining + 1, coffeeToken: false }));
    s = gameReducerDraw(s);
    s = log(s, `${player.name} sips their Coffee: +1 action and a draw.`);
  }

  // Vitamin: advance the tracker for a staged reward — draw, $1, +1 PL, +1 PL
  // (rulebook p.13; the reward lands at the start of the turn after purchase).
  if (has('Vitamin')) {
    const prev = player.vitaminStage ?? 0;
    if (prev < 4) {
      const stage = prev + 1;
      s = updatePlayer(s, index, (p) => ({ ...p, vitaminStage: stage }));
      if (stage === 1) {
        s = gameReducerDraw(s);
        s = log(s, `${player.name}'s Vitamin: draw a card.`);
      } else if (stage === 2) {
        s = updatePlayer(s, index, (p) => ({ ...p, money: p.money + 1 }));
        s = log(s, `${player.name}'s Vitamin: gain $1.`);
      } else {
        s = updatePlayer(s, index, (p) => ({ ...p, powerLevel: p.powerLevel + 1 }));
        s = log(s, `${player.name}'s Vitamin: +1 PL.`);
      }
    }
  }

  // Trash Can: bin the top Market card into the trash pile, then refill.
  if (has('Trash Can') && s.publicMarket.length > 0) {
    const binned = s.publicMarket[0];
    s = { ...s, publicMarket: s.publicMarket.slice(1), trashPile: [...(s.trashPile ?? []), binned] };
    s = refillMarkets(s);
    s = log(s, `${player.name}'s Trash Can bins ${binned.name}.`);
  }

  // Disguise is discarded at the start of the holder's turn (rulebook p.16).
  if (has('Disguise')) {
    s = updatePlayer(s, index, (p) => ({ ...p, inventory: p.inventory.filter((c) => c.name !== 'Disguise') }));
    s = log(s, `${player.name} sheds their Disguise.`);
  }
  return s;
}
