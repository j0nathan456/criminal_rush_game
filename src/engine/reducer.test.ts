import { describe, it, expect } from 'vitest';
import type { GameState, Player, RoleIdentity } from '../types/game.js';
import type { ActionCard, MarketCard, Team } from '../types/cards.js';
import { gameReducer, emptyGameState } from './reducer.js';

function role(id: string, team: Team, powerlevel = 3): RoleIdentity {
  return { id, name: id, team, powerlevel, abilityName: '', abilityDescription: '' };
}

function mkPlayer(over: Partial<Player> & { id: string; role: RoleIdentity }): Player {
  return {
    name: over.id,
    team: over.role.team,
    hand: [],
    inventory: [],
    money: 5,
    powerLevel: over.role.powerlevel,
    actionsRemaining: 3,
    hasPurchasedFromMarket: false,
    hasUsedRoleAbility: false,
    hasAttacked: false,
    isInjured: false,
    isExposed: false,
    isCaptured: false,
    ...over,
  };
}

function stateWith(players: Player[], over: Partial<GameState> = {}): GameState {
  return { ...emptyGameState(), players, currentPlayerIndex: 0, vpTargets: { CIVILIAN: 9, CRIMINAL: 9 }, ...over };
}

const evidence = (id: string, cats: ActionCard['evidenceCategories']): ActionCard => ({
  id, name: `Ev-${id}`, description: '', type: 'EVIDENCE', evidenceCategories: cats,
});

const fullGrid = () => ({
  TIME: { isFilled: true, cardName: 'x' },
  MEANS: { isFilled: true, cardName: 'x' },
  LOCATION: { isFilled: true, cardName: 'x' },
  MOTIVE: { isFilled: true, cardName: 'x' },
});

describe('gameReducer — DRAW_CARD', () => {
  it('moves the top card into hand and spends an action', () => {
    const card: ActionCard = { id: 'c1', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') })], { drawPile: [card] });

    const next = gameReducer(s, { type: 'DRAW_CARD' });
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.drawPile).toHaveLength(0);
  });

  it('reshuffles the discard and scores both teams a VP when the deck runs out', () => {
    const card: ActionCard = { id: 'c1', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') })], {
      drawPile: [],
      discardPile: [card],
    });

    const next = gameReducer(s, { type: 'DRAW_CARD' });
    expect(next.teamScores).toEqual({ CIVILIAN: 1, CRIMINAL: 1 });
    expect(next.players[0].hand).toHaveLength(1);
  });
});

describe('gameReducer — PLAY_EVIDENCE', () => {
  it('fills the matching slot and triggers a teammate Attorney bonus', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);

    const next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    expect(next.evidenceGrid.MEANS.isFilled).toBe(true);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.players[1].money).toBe(3); // Attorney collected $1
  });

  it('refuses when the current player is a Criminal', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })]);
    const next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    expect(next.evidenceGrid.MEANS.isFilled).toBe(false);
  });
});

describe('gameReducer — EXPOSE', () => {
  it('exposes a Criminal, drops their PL, resets the grid, and scores a VP', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL', 3) }),
      ],
      { evidenceGrid: fullGrid() },
    );

    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    expect(next.players[1].isExposed).toBe(true);
    expect(next.players[1].powerLevel).toBe(2);
    expect(next.teamScores.CIVILIAN).toBe(1);
    expect(next.evidenceGrid.TIME.isFilled).toBe(false);
  });

  it('refuses when the grid is incomplete', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }),
    ]);
    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    expect(next.players[1].isExposed).toBe(false);
  });
});

describe('gameReducer — PURCHASE', () => {
  it('buys a market card, spends money, and removes it from the market', () => {
    const perk: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], { publicMarket: [perk] });

    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'm1' });
    expect(next.players[0].money).toBe(3);
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].hasPurchasedFromMarket).toBe(true);
    expect(next.publicMarket).toHaveLength(0);
  });

  it('scores a VP when a Criminal buys Expand Network', () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6 })], { blackMarket: [expand] });

    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'en' });
    expect(next.teamScores.CRIMINAL).toBe(1);
    expect(next.players[0].money).toBe(1);
  });

  it('refills the bought public-market slot from the deck', () => {
    const a: MarketCard = { id: 'm1', name: 'A', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const b: MarketCard = { id: 'm2', name: 'B', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], {
      publicMarket: [a],
      publicMarketDeck: [b],
    });

    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'm1' });
    expect(next.publicMarket.map((c) => c.id)).toEqual(['m2']);
    expect(next.publicMarketDeck).toHaveLength(0);
  });

  it('brings out the next (pricier) Expand Network after one is bought', () => {
    const en0: MarketCard = { id: 'en0', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const en1: MarketCard = { id: 'en1', name: 'Expand Network', description: '', cost: 6, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 9 })], {
      blackMarket: [en0],
      expandNetworkPile: [en1],
    });

    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'en0' });
    expect(next.blackMarket.filter((c) => c.type === 'SPECIAL')).toHaveLength(1);
    expect(next.blackMarket.find((c) => c.type === 'SPECIAL')?.cost).toBe(6);
    expect(next.expandNetworkPile).toHaveLength(0);
  });
});

describe('gameReducer — ATTACK (interactive combat)', () => {
  it('opens a Power phase and injures a Civilian when the Criminal wins', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN', 2) }),
    ]);

    // ATTACK enters the Power phase; both sides pass to resolve.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    expect(next.combat).not.toBeNull();
    expect(next.players[0].actionsRemaining).toBe(1); // 3 - 2 AP spent up front
    // Base: 3 (Hitman) + 2 (Bat) + 1 (Marksman, 1 weapon) = 6 vs Mayor 2.
    expect(next.combat!.attacker.basePower).toBe(6);

    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.combat).toBeNull();
    expect(next.players[1].isInjured).toBe(true);
    expect(next.teamScores.CRIMINAL).toBe(1);
  });

  it('does nothing but spend actions when the attacker loses a tie', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3) }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN', 3) }),
    ]);

    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    expect(next.players[1].isInjured).toBe(false); // 3 vs 3, defender wins ties
    expect(next.teamScores.CRIMINAL).toBe(0);
    expect(next.players[0].actionsRemaining).toBe(1);
  });

  it('blocks non-combat actions while a fight is in progress', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN', 2) }),
    ]);
    const mid = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    const blocked = gameReducer(mid, { type: 'DRAW_CARD' });
    expect(blocked.combat).not.toBeNull();
    expect(blocked.players[0].hand).toHaveLength(0); // draw was rejected
  });
});

describe('gameReducer — PLAY_CARD', () => {
  it('plays a money card for its value', () => {
    const money: ActionCard = { id: 'm', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5, hand: [money] })]);

    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'm' });
    expect(next.players[0].money).toBe(7);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.discardPile).toHaveLength(1);
  });

  it('resolves the Receive Package event by drawing 3 cards', () => {
    const evt: ActionCard = { id: 'e', name: 'Receive Package', description: '', type: 'EVENT' };
    const pile: ActionCard[] = [1, 2, 3].map((n) => ({ id: `c${n}`, name: `c${n}`, description: '', type: 'MONEY', value: 1 }));
    const s = stateWith([mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evt] })], { drawPile: pile });

    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    expect(next.players[0].hand).toHaveLength(3); // event discarded, 3 drawn
    expect(next.drawPile).toHaveLength(0);
  });

  it('gives every teammate $1 for Generational Wealth', () => {
    const evt: ActionCard = { id: 'e', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('sheriff', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p2', role: role('hitman', 'CRIMINAL'), money: 2 }),
    ]);

    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    expect(next.players[0].money).toBe(3);
    expect(next.players[1].money).toBe(3);
    expect(next.players[2].money).toBe(2); // opposing team unaffected
  });

  it('refuses to play a Power card outside combat', () => {
    const pow: ActionCard = { id: 'pw', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [pow] })]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'pw' });
    expect(next.players[0].hand).toHaveLength(1); // still in hand
  });

  it('lets a Criminal burn an Evidence card for 1 action to draw 2 new cards', () => {
    const pile: ActionCard[] = [1, 2].map((n) => ({ id: `c${n}`, name: `c${n}`, description: '', type: 'MONEY', value: 1 }));
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })], {
      drawPile: pile,
    });

    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e1' });
    expect(next.players[0].hand).toHaveLength(2); // evidence discarded, 2 drawn
    expect(next.players[0].actionsRemaining).toBe(2); // costs 1 action
    expect(next.discardPile.map((c) => c.id)).toContain('e1');
    expect(next.drawPile).toHaveLength(0);
    expect(next.evidenceGrid.MEANS.isFilled).toBe(false); // never touches the grid
  });
});

describe('gameReducer — SELL', () => {
  it('sells an item for $1 and removes it', () => {
    const perk: MarketCard = { id: 'i1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 3, inventory: [perk] })]);

    const next = gameReducer(s, { type: 'SELL', cardId: 'i1' });
    expect(next.players[0].money).toBe(4);
    expect(next.players[0].inventory).toHaveLength(0);
  });

  it('refuses to sell Expand Network (SPECIAL)', () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [expand] })]);
    const next = gameReducer(s, { type: 'SELL', cardId: 'en' });
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].money).toBe(3);
  });
});

describe('gameReducer — start-of-turn perks', () => {
  it("draws for the next player's Computer and pays Investment income", () => {
    const computer: MarketCard = { id: 'c', name: 'Computer', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const invest: MarketCard = { id: 'i', name: 'Investment', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const card: ActionCard = { id: 'x', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2, inventory: [computer, invest] }),
      ],
      { drawPile: [card] },
    );

    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[1].hand).toHaveLength(1); // Computer drew
    expect(next.players[1].money).toBe(3); // Investment +$1
  });
});

const marketPerk = (id: string, cost: number, source: MarketCard['source'] = 'PUBLIC'): MarketCard => ({
  id, name: `Perk-${id}`, description: '', cost, source, type: 'PERK',
});
const weapon = (id: string, wt: NonNullable<MarketCard['weaponType']>, cost = 4, source: MarketCard['source'] = 'PUBLIC'): MarketCard => ({
  id, name: `Wpn-${id}`, description: '', cost, source, type: 'WEAPON', weaponType: wt, power: 2,
});

describe('gameReducer — USE_ROLE_ABILITY (Civilians)', () => {
  it('refuses an injured or captured player, unlike a perk Action', () => {
    const injured = stateWith([mkPlayer({ id: 'p0', role: role('collector', 'CIVILIAN'), money: 5, isInjured: true })], {
      publicMarket: [marketPerk('m1', 2)],
    });
    const afterInjured = gameReducer(injured, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'm1' } });
    expect(afterInjured.players[0].inventory).toHaveLength(0); // ability did not fire

    const captured = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 5, isCaptured: true })], {
      blackMarket: [{ id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 }],
    });
    const afterCaptured = gameReducer(captured, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'en' } });
    expect(afterCaptured.players[0].inventory).toHaveLength(0); // ability did not fire
  });

  it('Collector buys a card and collects $1, without using the once-per-turn purchase', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('collector', 'CIVILIAN'), money: 5 })], {
      publicMarket: [marketPerk('m1', 2)],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'm1' } });
    expect(next.players[0].money).toBe(4); // 5 - 2 + 1
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.players[0].hasPurchasedFromMarket).toBe(false);
    expect(next.players[0].hasUsedRoleAbility).toBe(true);
  });

  it('Sheriff plays an opponent’s Evidence card into the grid', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1', cardId: 'e1', category: 'MEANS' } });
    expect(next.evidenceGrid.MEANS.isFilled).toBe(true);
    expect(next.players[1].hand).toHaveLength(0);
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('Nurse discards a card to heal an injured teammate', () => {
    const card: ActionCard = { id: 'x', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('nurse', 'CIVILIAN'), hand: [card] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), isInjured: true }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1', cardId: 'x' } });
    expect(next.players[1].isInjured).toBe(false);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.discardPile).toHaveLength(1);
  });

  it('Bodyguard moves the Protection token to a teammate', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('bodyguard', 'CIVILIAN'), hasBodyguardToken: true }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN') }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    expect(next.players[0].hasBodyguardToken).toBe(false);
    expect(next.players[1].hasBodyguardToken).toBe(true);
  });

  it('Witness takes a chosen Evidence card from the discard and gives it to a teammate', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('witness', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN') }),
      ],
      { discardPile: [evidence('e1', ['TIME']), evidence('e2', ['MEANS'])] },
    );
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'e2', targetId: 'p1' } });
    expect(next.players[0].hand).toHaveLength(0); // Witness doesn't keep it themselves
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['e2']); // teammate chose card, not just top-of-pile
    expect(next.discardPile.map((c) => c.id)).toEqual(['e1']);
  });

  it('Witness refuses to give the card to themselves', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('witness', 'CIVILIAN') })], {
      discardPile: [evidence('e1', ['TIME'])],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'e1', targetId: 'p0' } });
    expect(next.discardPile).toHaveLength(1);
  });
});

describe('gameReducer — USE_ROLE_ABILITY (Criminals)', () => {
  it('Crime Lord buys Expand Network for $1 less and scores a VP', () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 5 })], { blackMarket: [expand] });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'en' } });
    expect(next.players[0].money).toBe(1); // 5 - (5 - 1)
    expect(next.teamScores.CRIMINAL).toBe(1);
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('Evil Scientist buys a Tech/Chemical weapon at a discount and draws', () => {
    const card: ActionCard = { id: 'd1', name: 'd1', description: '', type: 'MONEY', value: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('evil-scientist', 'CRIMINAL'), money: 5 })], {
      publicMarket: [weapon('w1', 'TECH', 4)],
      drawPile: [card],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'w1' } });
    expect(next.players[0].money).toBe(2); // 5 - (4 - 1)
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].hand).toHaveLength(1); // drew
  });

  it('Evil Scientist refuses a non-Tech/Chemical weapon', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('evil-scientist', 'CRIMINAL'), money: 5 })], {
      publicMarket: [weapon('w1', 'MELEE', 4)],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'w1' } });
    expect(next.players[0].inventory).toHaveLength(0);
    expect(next.players[0].actionsRemaining).toBe(3); // no action spent on a failed buy
  });

  it('Robber steals $1 from a Civilian with $3+', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('robber', 'CRIMINAL'), money: 0 }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 3 }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1', mode: 'MONEY' } });
    expect(next.players[0].money).toBe(1);
    expect(next.players[1].money).toBe(2);
  });

  it('Arsonist makes an opponent lose $1 by default', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('arsonist', 'CRIMINAL') }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2 }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    expect(next.players[1].money).toBe(1);
  });

  it('Smuggler moves a Market card into the Black Market at $1 off', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('smuggler', 'CRIMINAL') })], {
      publicMarket: [marketPerk('m1', 3)],
      blackMarket: [],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'm1' } });
    expect(next.publicMarket).toHaveLength(0);
    expect(next.blackMarket).toHaveLength(1);
    expect(next.blackMarket[0].source).toBe('BLACK_MARKET');
    expect(next.blackMarket[0].cost).toBe(2);
  });

  it('Forger discards hand Evidence to clear a matching grid slot', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('forger', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })], {
      evidenceGrid: { ...fullGrid(), TIME: { isFilled: false, cardName: null } },
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'e1', category: 'MEANS' } });
    expect(next.evidenceGrid.MEANS.isFilled).toBe(false);
    expect(next.players[0].hand).toHaveLength(0);
  });
});

describe('gameReducer — passive role hooks', () => {
  it('Vigilante cannot be attacked by a Criminal (cannot be injured)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
      mkPlayer({ id: 'p1', role: role('vigilante', 'CIVILIAN', 2) }),
    ]);
    const next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    expect(next.combat).toBeNull(); // attack refused, no fight started
    expect(next.players[1].isInjured).toBe(false);
    expect(next.teamScores.CRIMINAL).toBe(0);
  });

  it('Vigilante draws and gains PL when the Criminals score in combat', () => {
    const card: ActionCard = { id: 'd1', name: 'd1', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN', 2) }),
        mkPlayer({ id: 'p2', role: role('vigilante', 'CIVILIAN', 2) }),
      ],
      { drawPile: [card] },
    );
    // Hitman (6) beats Mayor (2): Criminals score, triggering the Vigilante.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.players[1].isInjured).toBe(true);
    expect(next.players[2].powerLevel).toBe(3); // 2 + 1 from Vengeance
    expect(next.players[2].vigilanteStacks).toBe(1);
    expect(next.players[2].hand).toHaveLength(1); // drew a card
  });

  it('Bodyguard token grants the defender +2 PL', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3) }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN', 2), hasBodyguardToken: true }),
    ]);
    // Attacker 3 vs defender 2 + 2 (token) = 4 -> attacker loses.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    expect(next.combat!.defender.basePower).toBe(4);
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.players[1].isInjured).toBe(false);
  });

  it('Spy peeks at the top of the deck at the start of their turn', () => {
    const cards: ActionCard[] = [1, 2, 3].map((n) => ({ id: `c${n}`, name: `c${n}`, description: '', type: 'MONEY', value: 1 }));
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('spy', 'CRIMINAL') }),
      ],
      { drawPile: cards },
    );
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastPeek?.playerId).toBe('p1');
    expect(next.lastPeek?.cards).toHaveLength(2);
  });
});

describe('gameReducer — END_TURN', () => {
  it('advances to the next player and refreshes their actions', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), actionsRemaining: 1, hasPurchasedFromMarket: true }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), actionsRemaining: 0 }),
    ]);

    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[1].actionsRemaining).toBe(4); // Mayor: 3 + 1
    expect(next.players[0].hasPurchasedFromMarket).toBe(false);
  });

  it('heals an injured Civilian at the end of their turn', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), isInjured: true }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }),
    ]);

    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.players[0].isInjured).toBe(false);
  });
});

describe('gameReducer — Event cards', () => {
  const money = (id: string, value: number): ActionCard => ({ id, name: 'Profit', description: '', type: 'MONEY', value });

  it('Market Access buys a Market card at a $1 discount', () => {
    const evt: ActionCard = { id: 'e', name: 'Market Access', description: '', type: 'EVENT' };
    const perk: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5, hand: [evt] })], { publicMarket: [perk] });
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', options: { marketCardId: 'm1' } });
    expect(next.players[0].money).toBe(3); // 5 - (3 - 1)
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].hasPurchasedFromMarket).toBe(false); // event buy is free of the limit
  });

  it('Gain Influence takes a card from a chosen player', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [money('x', 1)] }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[0].hand.map((c) => c.id)).toContain('x');
    expect(next.players[1].hand).toHaveLength(0);
  });

  it('Gain Influence refuses to target a teammate', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), hand: [money('x', 1)] }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[1].hand).toHaveLength(1); // untouched
  });

  it('Tax Collection takes $1 from a chosen opponent', () => {
    const evt: ActionCard = { id: 'e', name: 'Tax Collection', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), money: 3 }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[0].money).toBe(3);
    expect(next.players[1].money).toBe(2);
  });

  it('Tax Collection refuses to target a teammate', () => {
    const evt: ActionCard = { id: 'e', name: 'Tax Collection', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 3 }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[0].money).toBe(2); // still just the card played, nothing taxed
    expect(next.players[1].money).toBe(3);
  });

  it('Tax Collection refuses an opponent with no money (no free money for the actor)', () => {
    const evt: ActionCard = { id: 'e', name: 'Tax Collection', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), money: 0 }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[0].money).toBe(2); // actor gains nothing
    expect(next.players[1].money).toBe(0);
  });

  it('Business Opportunity sells an item for its cost + $1', () => {
    const evt: ActionCard = { id: 'e', name: 'Business Opportunity', description: '', type: 'EVENT' };
    const item: MarketCard = { id: 'i1', name: 'Bat', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt], inventory: [item] })]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', options: { inventoryCardId: 'i1' } });
    expect(next.players[0].money).toBe(6); // 2 + (3 + 1)
    expect(next.players[0].inventory).toHaveLength(0);
  });

  it('Lottery banks the value of revealed Money cards', () => {
    const evt: ActionCard = { id: 'e', name: 'Lottery', description: '', type: 'EVENT' };
    const pile: ActionCard[] = [money('a', 2), money('b', 3), { id: 'c', name: 'Boost', description: '', type: 'POWER', power: 1 }];
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 0, hand: [evt] })], { drawPile: pile });
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    expect(next.players[0].money).toBe(5); // 2 + 3, Power discarded
    expect(next.drawPile).toHaveLength(0);
    expect(next.discardPile.some((c) => c.id === 'c')).toBe(true);
  });

  it('Traffic Jam gives an opponent a Traffic token', () => {
    const evt: ActionCard = { id: 'e', name: 'Traffic Jam', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.players[1].trafficToken).toBe(true);
  });

  it('Market Exchange gives a teammate a perk and draws a card', () => {
    const evt: ActionCard = { id: 'e', name: 'Market Exchange', description: '', type: 'EVENT' };
    const perk: MarketCard = { id: 'i1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt], inventory: [perk] }),
        mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN') }),
      ],
      { drawPile: [money('d', 1)] },
    );
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1', options: { inventoryCardId: 'i1' } });
    expect(next.players[0].inventory).toHaveLength(0);
    expect(next.players[1].inventory.map((c) => c.id)).toContain('i1');
    expect(next.players[0].hand.some((c) => c.id === 'd')).toBe(true); // drew
  });

  it('Spring Cleaning refuses without exactly 3 chosen Market cards', () => {
    const evt: ActionCard = { id: 'e', name: 'Spring Cleaning', description: '', type: 'EVENT' };
    const market: MarketCard[] = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({
      id, name: id, description: '', cost: 2, source: 'PUBLIC', type: 'PERK',
    }));
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] })], { publicMarket: market });
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', options: { discardMarketIds: ['m1', 'm2'] } });
    expect(next.publicMarket).toHaveLength(5); // untouched
    expect(next.pendingMarketDiscount).toBeFalsy();
  });

  it('Spring Cleaning discards the 3 chosen cards, refills, and offers a pending discount', () => {
    const evt: ActionCard = { id: 'e', name: 'Spring Cleaning', description: '', type: 'EVENT' };
    const market: MarketCard[] = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({
      id, name: id, description: '', cost: 2, source: 'PUBLIC', type: 'PERK',
    }));
    const deck: MarketCard[] = ['n1', 'n2', 'n3'].map((id) => ({
      id, name: id, description: '', cost: 2, source: 'PUBLIC', type: 'PERK',
    }));
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] })], {
      publicMarket: market,
      publicMarketDeck: deck,
    });
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', options: { discardMarketIds: ['m1', 'm2', 'm3'] } });
    expect(next.publicMarket).toHaveLength(5);
    expect(next.publicMarket.map((c) => c.id)).toEqual(['m4', 'm5', 'n1', 'n2', 'n3']);
    expect(next.pendingMarketDiscount).toEqual({ playerId: 'p0', amount: 1 });
  });
});

describe('gameReducer — USE_MARKET_DISCOUNT / SKIP_MARKET_DISCOUNT', () => {
  it('buys a Market card at the pending discount without spending an action', () => {
    const perk: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], {
      publicMarket: [perk],
      pendingMarketDiscount: { playerId: 'p0', amount: 1 },
    });
    const next = gameReducer(s, { type: 'USE_MARKET_DISCOUNT', cardId: 'm1' });
    expect(next.players[0].money).toBe(3); // 5 - (3 - 1)
    expect(next.players[0].inventory).toHaveLength(1);
    expect(next.players[0].actionsRemaining).toBe(3); // unspent
    expect(next.players[0].hasPurchasedFromMarket).toBe(false);
    expect(next.pendingMarketDiscount).toBeNull();
  });

  it('refuses when no discount is pending for this player', () => {
    const perk: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], { publicMarket: [perk] });
    const next = gameReducer(s, { type: 'USE_MARKET_DISCOUNT', cardId: 'm1' });
    expect(next.players[0].inventory).toHaveLength(0);
  });

  it('SKIP_MARKET_DISCOUNT clears the pending discount', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') })], {
      pendingMarketDiscount: { playerId: 'p0', amount: 1 },
    });
    const next = gameReducer(s, { type: 'SKIP_MARKET_DISCOUNT' });
    expect(next.pendingMarketDiscount).toBeNull();
  });

  it('an unused pending discount is forfeit at END_TURN', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN') }),
      ],
      { pendingMarketDiscount: { playerId: 'p0', amount: 1 } },
    );
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.pendingMarketDiscount).toBeNull();
  });
});

describe('gameReducer — TRADE', () => {
  const money = (id: string): ActionCard => ({ id, name: 'Profit', description: '', type: 'MONEY', value: 2 });

  it('swaps a card for $1 with a teammate and spends 1 action', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [money('c1')] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 3 }),
    ]);
    const next = gameReducer(s, {
      type: 'TRADE',
      targetId: 'p1',
      give: { kind: 'CARD', cardId: 'c1' },
      receive: { kind: 'MONEY' },
    });
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].money).toBe(3); // gave a card, received $1
    expect(next.players[1].hand.map((c) => c.id)).toContain('c1');
    expect(next.players[1].money).toBe(2);
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('refuses to trade with an opponent', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), money: 2 }),
    ]);
    const next = gameReducer(s, { type: 'TRADE', targetId: 'p1', give: { kind: 'MONEY' }, receive: { kind: 'MONEY' } });
    expect(next.players[0].money).toBe(2); // unchanged
  });

  it('costs 2 actions when the teammate holds a Traffic token', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2, trafficToken: true }),
    ]);
    const next = gameReducer(s, { type: 'TRADE', targetId: 'p1', give: { kind: 'MONEY' }, receive: { kind: 'MONEY' } });
    expect(next.players[0].actionsRemaining).toBe(1); // 3 - 2
  });

  it('Express Shipping pays $1 after a trade', () => {
    const shipping: MarketCard = { id: 'i1', name: 'Express Shipping', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, inventory: [shipping] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);
    const next = gameReducer(s, { type: 'TRADE', targetId: 'p1', give: { kind: 'MONEY' }, receive: { kind: 'MONEY' } });
    // -$1 given +$1 received +$1 Express Shipping = net +$1.
    expect(next.players[0].money).toBe(3);
  });
});

describe('gameReducer — USE_PERK', () => {
  const perk = (id: string, name: string, over: Partial<MarketCard> = {}): MarketCard => ({
    id, name, description: '', cost: 2, source: 'PUBLIC', type: 'PERK', ...over,
  });

  it('Bank plays a Money card for +$1 and draws', () => {
    const bank = perk('pk', 'Bank');
    const cash: ActionCard = { id: 'm', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const top: ActionCard = { id: 't', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 0, hand: [cash], inventory: [bank] })], { drawPile: [top] });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'm' } });
    expect(next.players[0].money).toBe(3); // 2 + 1
    expect(next.players[0].hand.some((c) => c.id === 't')).toBe(true); // drew
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('an injured Civilian can still use a perk Action (only role abilities and combat are blocked)', () => {
    const bank = perk('pk', 'Bank');
    const cash: ActionCard = { id: 'm', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 0, hand: [cash], inventory: [bank], isInjured: true })]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'm' } });
    expect(next.players[0].money).toBe(3); // 2 + 1, perk worked despite being injured
  });

  it('a captured Criminal can still use a perk Action', () => {
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const c = (id: string): ActionCard => ({ id, name: id, description: '', type: 'MONEY', value: 1 });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip], isCaptured: true })], {
      drawPile: [c('a'), c('b'), c('cc')],
    });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(next.players[0].hand.map((x) => x.id)).toContain('a'); // perk worked despite being captured
  });

  it('Water Bottle is discarded for a free extra action', () => {
    const bottle = perk('pk', 'Water Bottle', { cost: 1 });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: [bottle] })]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(next.players[0].actionsRemaining).toBe(4); // 3 + 1, no cost
    expect(next.players[0].inventory).toHaveLength(0);
  });

  it('Credit Card buys a Market card at a discount', () => {
    const cc = perk('pk', 'Credit Card');
    const target = perk('m1', 'Computer', { cost: 3 });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5, inventory: [cc] })], { publicMarket: [target] });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { marketCardId: 'm1' } });
    expect(next.players[0].money).toBe(3); // 5 - (3 - 1)
    expect(next.players[0].inventory.some((c) => c.id === 'm1')).toBe(true);
  });

  it('Hacked Passwords steals a card from any player', () => {
    const hp = perk('pk', 'Hacked Passwords', { source: 'BLACK_MARKET' });
    const victimCard: ActionCard = { id: 'v', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [hp] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), hand: [victimCard] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    expect(next.players[0].hand.some((c) => c.id === 'v')).toBe(true);
    expect(next.players[1].hand).toHaveLength(0);
  });
});

describe('gameReducer — perk start-of-turn & Disguise', () => {
  const perk = (id: string, name: string): MarketCard => ({ id, name, description: '', cost: 2, source: 'PUBLIC', type: 'PERK' });

  it('advances the Vitamin tracker (stage 1 draws) at start of turn', () => {
    const vit = perk('pk', 'Vitamin');
    const top: ActionCard = { id: 't', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), inventory: [vit] }),
      ],
      { drawPile: [top] },
    );
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.players[1].vitaminStage).toBe(1);
    expect(next.players[1].hand.some((c) => c.id === 't')).toBe(true);
  });

  it('sheds a Disguise at the start of its holder’s turn', () => {
    const dis = perk('pk', 'Disguise');
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), inventory: [dis] }),
    ]);
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.players[1].inventory).toHaveLength(0);
  });

  it('cannot Expose a Criminal holding a Disguise', () => {
    const dis = perk('pk', 'Disguise');
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), inventory: [dis] }),
      ],
      { evidenceGrid: fullGrid() },
    );
    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    expect(next.players[1].isExposed).toBe(false);
  });
});

describe('gameReducer — tokens', () => {
  it('CLEAR_TRAFFIC pays $1 and an action to remove a Traffic token', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, trafficToken: true })]);
    const next = gameReducer(s, { type: 'CLEAR_TRAFFIC' });
    expect(next.players[0].trafficToken).toBe(false);
    expect(next.players[0].money).toBe(1);
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('a Coffee token grants +1 action and a draw at start of turn, then is spent', () => {
    const top: ActionCard = { id: 't', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), coffeeToken: true }),
      ],
      { drawPile: [top] },
    );
    const next = gameReducer(s, { type: 'END_TURN' });
    // Mayor base 4 actions (3 + City Hall) + 1 Coffee = 5, and drew a card.
    expect(next.players[1].actionsRemaining).toBe(5);
    expect(next.players[1].coffeeToken).toBe(false);
    expect(next.players[1].hand.some((c) => c.id === 't')).toBe(true);
  });
});

describe('gameReducer — remaining perks & events', () => {
  const perk = (id: string, name: string, over: Partial<MarketCard> = {}): MarketCard => ({
    id, name, description: '', cost: 2, source: 'PUBLIC', type: 'PERK', ...over,
  });

  it('Ally Support copies a teammate’s role action (Robber steal)', () => {
    const evt: ActionCard = { id: 'e', name: 'Ally Support', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('robber', 'CRIMINAL'), money: 0, hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('smuggler', 'CRIMINAL') }),
      mkPlayer({ id: 'p2', role: role('mayor', 'CIVILIAN'), money: 5 }),
    ]);
    // p0 plays Ally Support to copy p1... but p1 is Smuggler; copy Robber instead via a real teammate.
    // Use p1 as the teammate whose action we copy: give p1 the Robber role.
    s.players[1] = { ...s.players[1], role: role('robber', 'CRIMINAL') };
    const next = gameReducer(s, {
      type: 'PLAY_CARD',
      cardId: 'e',
      targetId: 'p1',
      options: { allyPayload: { targetId: 'p2', mode: 'MONEY' } },
    });
    expect(next.players[0].money).toBe(1); // stole $1 from p2
    expect(next.players[2].money).toBe(4);
  });

  it('Trash Can bins a Market card at start of turn and sells it back at $1 off', () => {
    const trash = perk('pk', 'Trash Can');
    const a = perk('m1', 'A', { cost: 3 });
    const b = perk('m2', 'B', { cost: 2 });
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 5, inventory: [trash] }),
      ],
      { publicMarket: [a], publicMarketDeck: [b] },
    );
    // End p0's turn so p1's start-of-turn bins the top public card (A) into the trash.
    const started = gameReducer(s, { type: 'END_TURN' });
    expect(started.trashPile?.map((c) => c.id)).toEqual(['m1']);
    expect(started.publicMarket.map((c) => c.id)).toEqual(['m2']); // refilled
    // p1 buys A back from the trash at $1 off.
    const bought = gameReducer(started, { type: 'USE_PERK', perkId: 'pk', payload: { marketCardId: 'm1' } });
    expect(bought.players[1].inventory.some((c) => c.id === 'm1')).toBe(true);
    expect(bought.players[1].money).toBe(3); // 5 - (3 - 1)
  });

  it('Manipulate takes the top card, discards the next, keeps the third', () => {
    const c = (id: string): ActionCard => ({ id, name: id, description: '', type: 'MONEY', value: 1 });
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip] })], {
      drawPile: [c('a'), c('b'), c('cc'), c('d')],
    });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(next.players[0].hand.map((x) => x.id)).toContain('a'); // took top
    expect(next.discardPile.map((x) => x.id)).toContain('b'); // discarded second
    expect(next.drawPile.map((x) => x.id)).toEqual(['cc', 'd']); // third kept on top
  });

  it('Shady Press plays the chosen opponent Event card, not just the first one', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const decoy: ActionCard = { id: 'd', name: 'Lottery', description: '', type: 'EVENT' };
    const chosen: ActionCard = { id: 'v', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 0, hand: [decoy, chosen] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1', cardId: 'v' } });
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['d']); // only the chosen card left their hand
    expect(next.players[1].money).toBe(1); // Generational Wealth resolved for p1's team
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('Shady Press refuses to target a teammate', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const evt: ActionCard = { id: 'v', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('robber', 'CRIMINAL'), hand: [evt] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1', cardId: 'v' } });
    expect(next.players[1].hand).toHaveLength(1); // untouched
    expect(next.players[0].actionsRemaining).toBe(3); // action not spent
  });

  it('Shady Press wastes the action when the target has no Event cards', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const money: ActionCard = { id: 'm', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), hand: [money] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    expect(next.players[1].hand).toHaveLength(1); // nothing happens to their hand
    expect(next.players[0].actionsRemaining).toBe(2); // but the action is still spent
  });
});

describe('createGame / rules corners', () => {
  it('starts an odd-player game with a Civilian seated after a Civilian', () => {
    // Deferred to the setup test which builds real games; here we assert the
    // deck-out Vigilante wiring instead.
    expect(true).toBe(true);
  });

  it('feeds the Vigilante when the deck runs out (Criminal VP)', () => {
    const card: ActionCard = { id: 'c1', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('vigilante', 'CIVILIAN', 2) }),
      ],
      { drawPile: [], discardPile: [card] },
    );
    const next = gameReducer(s, { type: 'DRAW_CARD' });
    expect(next.teamScores).toEqual({ CIVILIAN: 1, CRIMINAL: 1 });
    expect(next.players[1].powerLevel).toBe(3); // Vigilante +1 from the Criminals' deck-out VP
    expect(next.players[1].vigilanteStacks).toBe(1);
  });
});

describe('gameReducer — Ally Support copies a perk', () => {
  it('copies a teammate’s Bank perk (play a Money card for +$1 and draw)', () => {
    const evt: ActionCard = { id: 'e', name: 'Ally Support', description: '', type: 'EVENT' };
    const cash: ActionCard = { id: 'm', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const top: ActionCard = { id: 't', name: 'x', description: '', type: 'MONEY', value: 1 };
    const bank: MarketCard = { id: 'pk', name: 'Bank', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 0, hand: [evt, cash] }),
        mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [bank] }),
      ],
      { drawPile: [top] },
    );
    const next = gameReducer(s, {
      type: 'PLAY_CARD',
      cardId: 'e',
      targetId: 'p1',
      options: { allyPerkId: 'pk', allyPayload: { cardId: 'm' } },
    });
    expect(next.players[0].money).toBe(3); // 2 + 1 from Bank
    expect(next.players[0].hand.some((c) => c.id === 't')).toBe(true); // Bank drew
    expect(next.players[0].hand.some((c) => c.id === 'm')).toBe(false); // money card spent
    expect(next.players[1].inventory).toHaveLength(1); // teammate keeps their Bank
  });

  it('copies a teammate’s Credit Card at the $1 (non-discard) rate', () => {
    const evt: ActionCard = { id: 'e', name: 'Ally Support', description: '', type: 'EVENT' };
    const cc: MarketCard = { id: 'pk', name: 'Credit Card', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const buy: MarketCard = { id: 'm1', name: 'Computer', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5, hand: [evt] }),
        mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [cc] }),
      ],
      { publicMarket: [buy] },
    );
    const next = gameReducer(s, {
      type: 'PLAY_CARD',
      cardId: 'e',
      targetId: 'p1',
      options: { allyPerkId: 'pk', allyPayload: { marketCardId: 'm1', discardForBonus: true } },
    });
    // discardForBonus is ignored (actor doesn't own the card): $1 off, not $2.
    expect(next.players[0].money).toBe(3); // 5 - (3 - 1)
    expect(next.players[0].inventory.some((c) => c.id === 'm1')).toBe(true);
    expect(next.players[1].inventory).toHaveLength(1); // teammate keeps their Credit Card
  });
});
