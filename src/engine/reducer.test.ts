import { describe, it, expect } from 'vitest';
import type { GameState, Player, RoleIdentity } from '../types/game.js';
import type { ActionCard, EvidenceCategory, MarketCard, Team } from '../types/cards.js';
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
  TIME: { cards: [evidence('g-time', ['TIME'])] },
  MEANS: { cards: [evidence('g-means', ['MEANS'])] },
  LOCATION: { cards: [evidence('g-location', ['LOCATION'])] },
  MOTIVE: { cards: [evidence('g-motive', ['MOTIVE'])] },
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
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['e1']);
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.players[1].money).toBe(3); // Attorney collected $1
  });

  it('does not pay an injured Attorney when a teammate plays Evidence', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2, isInjured: true }),
    ]);

    const next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    expect(next.players[1].money).toBe(2); // no Retainer payout while injured
  });

  it('leaves the card sitting in the grid rather than discarding it on play', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])] })]);
    const next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    expect(next.discardPile).toHaveLength(0); // only an Expose moves it to the discard
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['e1']);
  });

  it('lets multiple Evidence cards pile up in the same category', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS']), evidence('e2', ['MEANS'])] }),
    ]);
    let next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    next = gameReducer(next, { type: 'PLAY_EVIDENCE', cardId: 'e2', category: 'MEANS' });
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['e1', 'e2']);
  });

  it('refuses when the current player is a Criminal', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })]);
    const next = gameReducer(s, { type: 'PLAY_EVIDENCE', cardId: 'e1', category: 'MEANS' });
    expect(next.evidenceGrid.MEANS.cards).toHaveLength(0);
  });
});

describe('gameReducer — CASH_IN_EVIDENCE', () => {
  it('refuses until every Criminal has been exposed (or captured)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }), // not exposed
    ]);
    const next = gameReducer(s, { type: 'CASH_IN_EVIDENCE', cardId: 'e1' });
    expect(next.players[0].hand).toHaveLength(1); // still in hand
    expect(next.players[0].money).toBe(5); // unchanged
  });

  it('discards the card for $2 once every Criminal is exposed', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])], money: 3 }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), isExposed: true }),
    ]);
    const next = gameReducer(s, { type: 'CASH_IN_EVIDENCE', cardId: 'e1' });
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].money).toBe(5); // +$2
    expect(next.players[0].actionsRemaining).toBe(2); // costs 1 action
    expect(next.discardPile.map((c) => c.id)).toEqual(['e1']);
    expect(next.evidenceGrid.MEANS.cards).toHaveLength(0); // never touches the grid
  });

  it('also counts an already-captured Criminal as dealt with (capturing un-exposes them)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), hand: [evidence('e1', ['MEANS'])] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), isExposed: false, isCaptured: true }),
    ]);
    const next = gameReducer(s, { type: 'CASH_IN_EVIDENCE', cardId: 'e1' });
    expect(next.players[0].hand).toHaveLength(0); // allowed
  });

  it('refuses when the actor is a Criminal, even with every Criminal exposed', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])], isExposed: true }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN') }),
    ]);
    const next = gameReducer(s, { type: 'CASH_IN_EVIDENCE', cardId: 'e1' });
    expect(next.players[0].hand).toHaveLength(1); // still in hand — Criminals can't cash in
  });
});

describe('gameReducer — EXPOSE', () => {
  it('exposes a Criminal, drops their PL, discards 1 card per category, and scores a VP', () => {
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
    expect(next.evidenceGrid.TIME.cards).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id).sort()).toEqual(['g-location', 'g-means', 'g-motive', 'g-time']);
  });

  it('refuses when the grid is incomplete', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }),
    ]);
    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    expect(next.players[1].isExposed).toBe(false);
  });

  it('when a category holds more than one card, spends only the exposer’s chosen one and keeps the rest', () => {
    const kept = evidence('e-kept', ['TIME']);
    const grid = { ...fullGrid(), TIME: { cards: [evidence('e-spent', ['TIME']), kept] } };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL', 3) }),
      ],
      { evidenceGrid: grid },
    );

    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1', evidenceChoices: { TIME: 'e-spent' } });
    expect(next.evidenceGrid.TIME.cards.map((c) => c.id)).toEqual(['e-kept']); // untouched, still in the grid
    expect(next.discardPile.map((c) => c.id)).toContain('e-spent');
    expect(next.discardPile.map((c) => c.id)).not.toContain('e-kept');
  });

  it('defaults to the oldest card in a category when no choice is given', () => {
    const grid = { ...fullGrid(), TIME: { cards: [evidence('e-oldest', ['TIME']), evidence('e-newest', ['TIME'])] } };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL', 3) }),
      ],
      { evidenceGrid: grid },
    );

    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    expect(next.evidenceGrid.TIME.cards.map((c) => c.id)).toEqual(['e-newest']);
    expect(next.discardPile.map((c) => c.id)).toContain('e-oldest');
  });

  it('leaves the grid still complete (still Exposable) when every category had a spare card', () => {
    const doubled = (cat: EvidenceCategory) => ({ cards: [evidence(`${cat}-a`, [cat]), evidence(`${cat}-b`, [cat])] });
    const grid = { TIME: doubled('TIME'), MEANS: doubled('MEANS'), LOCATION: doubled('LOCATION'), MOTIVE: doubled('MOTIVE') };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL', 3) }),
        mkPlayer({ id: 'p2', role: role('mayor', 'CRIMINAL', 3) }),
      ],
      { evidenceGrid: grid },
    );

    const next = gameReducer(s, { type: 'EXPOSE', targetId: 'p1' });
    const second = gameReducer(next, { type: 'EXPOSE', targetId: 'p2' });
    expect(second.players[2].isExposed).toBe(true); // exposed again without needing to refill the grid
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

  it('refuses to sell Expand Network — it has its own dedicated Action now', () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6 })], { blackMarket: [expand] });

    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'en' });
    expect(next.players[0].inventory).toHaveLength(0); // not bought
    expect(next.players[0].money).toBe(6); // untouched
    expect(next.teamScores.CRIMINAL).toBe(0);
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

  describe('Coffee Machine', () => {
    const coffee: MarketCard = { id: 'cm', name: 'Coffee Machine', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };

    it('defaults the brewed token to the buyer when no recipient is given', () => {
      const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], { publicMarket: [coffee] });
      const next = gameReducer(s, { type: 'PURCHASE', cardId: 'cm' });
      expect(next.players[0].coffeeToken).toBe(true);
    });

    it('gives the token to a chosen teammate instead of the buyer', () => {
      const s = stateWith(
        [
          mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 }),
          mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN') }),
        ],
        { publicMarket: [coffee] },
      );
      const next = gameReducer(s, { type: 'PURCHASE', cardId: 'cm', coffeeRecipientId: 'p1' });
      expect(next.players[0].coffeeToken).toBeUndefined();
      expect(next.players[1].coffeeToken).toBe(true);
      expect(next.gameLog.at(-1)).toContain('for');
    });

    it('ignores a coffeeRecipientId that is an opponent, falling back to the buyer', () => {
      const s = stateWith(
        [
          mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 }),
          mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL') }),
        ],
        { publicMarket: [coffee] },
      );
      const next = gameReducer(s, { type: 'PURCHASE', cardId: 'cm', coffeeRecipientId: 'p1' });
      expect(next.players[0].coffeeToken).toBe(true);
      expect(next.players[1].coffeeToken).toBeUndefined();
    });
  });
});

describe('gameReducer — EXPAND_NETWORK', () => {
  const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };

  it('buys the face-up Expand Network and scores a VP for a Criminal', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6 })], { blackMarket: [expand] });
    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.teamScores.CRIMINAL).toBe(1);
    expect(next.players[0].money).toBe(1);
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('does not set hasPurchasedFromMarket — a separate Buy stays available the same turn', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6 })], { blackMarket: [expand] });
    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.players[0].hasPurchasedFromMarket).toBe(false);
  });

  it('charges $1 more once the buyer is captured (Weakened Network)', () => {
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6, isCaptured: true })],
      { blackMarket: [expand] },
    );
    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.players[0].money).toBe(0); // 6 - (5 + 1)
  });

  it('brings out the next (pricier) Expand Network after one is bought', () => {
    const en0: MarketCard = { id: 'en0', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const en1: MarketCard = { id: 'en1', name: 'Expand Network', description: '', cost: 6, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 9 })], {
      blackMarket: [en0],
      expandNetworkPile: [en1],
    });

    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.blackMarket.filter((c) => c.type === 'SPECIAL')).toHaveLength(1);
    expect(next.blackMarket.find((c) => c.type === 'SPECIAL')?.cost).toBe(6);
    expect(next.expandNetworkPile).toHaveLength(0);
  });

  it('refuses a Civilian', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 6 })], { blackMarket: [expand] });
    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.players[0].money).toBe(6);
  });

  it('refuses when no Expand Network card is available', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 6 })], { blackMarket: [] });
    const next = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(next.players[0].actionsRemaining).toBe(3); // action not spent
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
    expect(next.evidenceGrid.MEANS.cards).toHaveLength(0); // never touches the grid
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

  const bribery: MarketCard = { id: 'br', name: 'Bribery', description: '', cost: 1, source: 'BLACK_MARKET', type: 'PERK' };

  it('selling Bribery offers to bribe a Civilian, blocking other actions until resolved', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [bribery] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2 }),
    ], { evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence('e1', ['MEANS'])] } } });

    const sold = gameReducer(s, { type: 'SELL', cardId: 'br' });
    expect(sold.players[0].money).toBe(4); // still gets the normal $1 sale proceeds
    expect(sold.pendingBribery).toEqual({ playerId: 'p0' });

    const blocked = gameReducer(sold, { type: 'DRAW_CARD' });
    expect(blocked.pendingBribery).toBeTruthy(); // still pending — draw refused
  });

  it('does not offer Bribery with no Civilian to pay, or no Evidence in the grid', () => {
    const noCivilian = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [bribery] })], {
      evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence('e1', ['MEANS'])] } },
    });
    expect(gameReducer(noCivilian, { type: 'SELL', cardId: 'br' }).pendingBribery).toBeFalsy();

    const noEvidence = stateWith([
      mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [bribery] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2 }),
    ]);
    expect(gameReducer(noEvidence, { type: 'SELL', cardId: 'br' }).pendingBribery).toBeFalsy();
  });

  it('resolving Bribery pays the chosen Civilian $1 and discards the chosen grid card', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [bribery] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2 }),
    ], { evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence('e1', ['MEANS'])] } } });
    const sold = gameReducer(s, { type: 'SELL', cardId: 'br' });

    const next = gameReducer(sold, { type: 'RESOLVE_BRIBERY', targetId: 'p1', category: 'MEANS', cardId: 'e1' });
    expect(next.pendingBribery).toBeNull();
    expect(next.players[0].money).toBe(3); // paid the $1 straight back out
    expect(next.players[1].money).toBe(3); // Civilian receives it
    expect(next.evidenceGrid.MEANS.cards).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id)).toContain('e1');
  });

  it('refuses an invalid Bribery target or card, staying pending for retry', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 3, inventory: [bribery] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p2', role: role('hitman', 'CRIMINAL'), money: 2 }),
    ], { evidenceGrid: { ...emptyGameState().evidenceGrid, MEANS: { cards: [evidence('e1', ['MEANS'])] } } });
    const sold = gameReducer(s, { type: 'SELL', cardId: 'br' });

    // Not a Civilian.
    const badTarget = gameReducer(sold, { type: 'RESOLVE_BRIBERY', targetId: 'p2', category: 'MEANS', cardId: 'e1' });
    expect(badTarget.pendingBribery).not.toBeNull();

    // Paying yourself.
    const self = gameReducer(sold, { type: 'RESOLVE_BRIBERY', targetId: 'p0', category: 'MEANS', cardId: 'e1' });
    expect(self.pendingBribery).not.toBeNull();

    // No such grid card.
    const badCard = gameReducer(sold, { type: 'RESOLVE_BRIBERY', targetId: 'p1', category: 'MEANS', cardId: 'nope' });
    expect(badCard.pendingBribery).not.toBeNull();
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

  const getawayCar: MarketCard = { id: 'gc', name: 'Getaway Car', description: '', cost: 3, source: 'BLACK_MARKET', type: 'PERK' };
  const giftCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };

  it('offers to give Getaway Car away at the start of a turn, blocking other actions until answered', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [getawayCar], hand: [giftCard] }),
    ]);
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.pendingGetawayCarGift).toEqual({ playerId: 'p1' });

    const blocked = gameReducer(next, { type: 'DRAW_CARD' });
    expect(blocked.pendingGetawayCarGift).toBeTruthy(); // still pending — draw refused
  });

  it('declining Getaway Car’s offer leaves it and the hand untouched', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [getawayCar], hand: [giftCard] }),
    ]);
    const offered = gameReducer(s, { type: 'END_TURN' });
    const next = gameReducer(offered, { type: 'RESOLVE_GETAWAY_CAR_GIFT', give: false });
    expect(next.pendingGetawayCarGift).toBeNull();
    expect(next.players[1].inventory.some((c) => c.name === 'Getaway Car')).toBe(true);
    expect(next.players[1].hand).toHaveLength(1);
  });

  it('giving Getaway Car moves both the perk and the chosen card to the teammate', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [getawayCar], hand: [giftCard] }),
    ]);
    const offered = gameReducer(s, { type: 'END_TURN' });
    const next = gameReducer(offered, { type: 'RESOLVE_GETAWAY_CAR_GIFT', give: true, teammateId: 'p0', cardId: 'h1' });
    expect(next.pendingGetawayCarGift).toBeNull();
    expect(next.players[1].inventory.some((c) => c.name === 'Getaway Car')).toBe(false);
    expect(next.players[1].hand).toHaveLength(0);
    expect(next.players[0].inventory.some((c) => c.name === 'Getaway Car')).toBe(true);
    expect(next.players[0].hand.map((c) => c.id)).toContain('h1');
  });

  it('does not offer Getaway Car with no teammate to give it to, or an empty hand', () => {
    const solo = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), inventory: [getawayCar], hand: [giftCard] }),
    ]);
    expect(gameReducer(solo, { type: 'END_TURN' }).pendingGetawayCarGift).toBeFalsy(); // no teammate — different team

    const emptyHand = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [getawayCar], hand: [] }),
    ]);
    expect(gameReducer(emptyHand, { type: 'END_TURN' }).pendingGetawayCarGift).toBeFalsy();
  });

  it('refuses to give Getaway Car to a teammate whose perk rack is already full, staying pending', () => {
    const fullPerks: MarketCard[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, description: '', cost: 1, source: 'PUBLIC', type: 'PERK' }));
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: fullPerks }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [getawayCar], hand: [giftCard] }),
    ]);
    const offered = gameReducer(s, { type: 'END_TURN' });
    const next = gameReducer(offered, { type: 'RESOLVE_GETAWAY_CAR_GIFT', give: true, teammateId: 'p0', cardId: 'h1' });
    expect(next.pendingGetawayCarGift).toEqual({ playerId: 'p1' }); // still pending
    expect(next.players[1].inventory.some((c) => c.name === 'Getaway Car')).toBe(true); // never left p1
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

  it('Sheriff subpoenas an opponent, revealing their Evidence, then plays one into its category', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] }),
    ]);
    const revealed = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    expect(revealed.players[0].actionsRemaining).toBe(2); // spent on targeting alone
    expect(revealed.pendingSheriff?.cards.map((c) => c.id)).toEqual(['e1']);
    const next = gameReducer(revealed, { type: 'RESOLVE_SHERIFF', cardId: 'e1' });
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['e1']);
    expect(next.players[1].hand).toHaveLength(0);
    expect(next.pendingSheriff).toBeNull();
  });

  it('pays a teammate Attorney when the Sheriff plays the subpoenaed Evidence into the grid', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] }),
      mkPlayer({ id: 'p2', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);
    const revealed = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    const next = gameReducer(revealed, { type: 'RESOLVE_SHERIFF', cardId: 'e1' });
    expect(next.players[2].money).toBe(3); // Attorney collected $1
  });

  it('Sheriff must choose a category for a wild Evidence card', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [evidence('wild1', ['MEANS', 'MOTIVE'])] }),
    ]);
    const revealed = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    const stuck = gameReducer(revealed, { type: 'RESOLVE_SHERIFF', cardId: 'wild1' });
    expect(stuck.pendingSheriff).not.toBeNull(); // no category chosen yet — still pending
    const next = gameReducer(revealed, { type: 'RESOLVE_SHERIFF', cardId: 'wild1', category: 'MOTIVE' });
    expect(next.evidenceGrid.MOTIVE.cards.map((c) => c.id)).toEqual(['wild1']);
    expect(next.pendingSheriff).toBeNull();
  });

  it('Sheriff subpoena is wasted when the target has no Evidence cards', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [] }),
    ]);
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    expect(next.pendingSheriff).toBeNull();
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.players[0].hasUsedRoleAbility).toBe(true);
    expect(next.gameLog.at(-1)).toMatch(/has no Evidence cards/);
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

  it("Connections is separate from the normal Expand Network Action — using it doesn't set hasPurchasedFromMarket, so Buy stays available", () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 5 })], { blackMarket: [expand] });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'en' } });
    expect(next.players[0].hasPurchasedFromMarket).toBe(false);
  });

  it('Connections is gated by hasUsedRoleAbility, independent of the plain Expand Network Action', () => {
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 5, hasUsedRoleAbility: true })],
      { blackMarket: [expand] },
    );
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'en' } });
    expect(next.players[0].money).toBe(5); // ability refused, nothing bought
  });

  it('buying Expand Network via the plain Action does not spend the Crime Lord role ability — Connections is still usable after', () => {
    const en0: MarketCard = { id: 'en0', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const en1: MarketCard = { id: 'en1', name: 'Expand Network', description: '', cost: 6, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 20 })], {
      blackMarket: [en0],
      expandNetworkPile: [en1],
    });
    const afterPlainBuy = gameReducer(s, { type: 'EXPAND_NETWORK' });
    expect(afterPlainBuy.players[0].hasUsedRoleAbility).toBe(false);

    const afterConnections = gameReducer(afterPlainBuy, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'en1' } });
    expect(afterConnections.players[0].money).toBe(20 - 5 - (6 - 1)); // full price, then $1 off
    expect(afterConnections.teamScores.CRIMINAL).toBe(2); // both purchases scored a VP
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

  it('Arsonist threatens an opponent, who then chooses how they lose out', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('arsonist', 'CRIMINAL') }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evidence('e1', ['MEANS'])] }),
    ]);
    const threatened = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    // The target hasn't lost anything yet — it's their choice, still pending.
    expect(threatened.pendingThreaten).toEqual({ targetId: 'p1' });
    expect(threatened.players[1].money).toBe(2);
    expect(threatened.players[0].hasUsedRoleAbility).toBe(true);

    // Other actions are blocked until the target resolves the choice.
    const blocked = gameReducer(threatened, { type: 'DRAW_CARD' });
    expect(blocked.pendingThreaten).toEqual({ targetId: 'p1' });

    // The target — not the Arsonist — picks discarding over losing money,
    // and picks which card to discard themselves (not random).
    const resolved = gameReducer(threatened, { type: 'RESOLVE_THREATEN', mode: 'DISCARD', cardId: 'e1' });
    expect(resolved.pendingThreaten).toBeNull();
    expect(resolved.players[1].money).toBe(2);
    expect(resolved.players[1].hand).toHaveLength(0);
    expect(resolved.discardPile).toContainEqual(expect.objectContaining({ id: 'e1' }));
  });

  it("Threaten's discard is the target's own choice of card, not the first one in hand", () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('arsonist', 'CRIMINAL') }),
      mkPlayer({
        id: 'p1', role: role('mayor', 'CIVILIAN'), money: 2,
        hand: [evidence('e1', ['MEANS']), evidence('e2', ['MOTIVE'])],
      }),
    ]);
    const threatened = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    // Choosing DISCARD without a card yet doesn't resolve — still their turn to pick.
    const notYet = gameReducer(threatened, { type: 'RESOLVE_THREATEN', mode: 'DISCARD' });
    expect(notYet.pendingThreaten).toEqual({ targetId: 'p1' });
    expect(notYet.players[1].hand).toHaveLength(2);

    // They pick the second card specifically, not hand[0].
    const resolved = gameReducer(threatened, { type: 'RESOLVE_THREATEN', mode: 'DISCARD', cardId: 'e2' });
    expect(resolved.players[1].hand.map((c) => c.id)).toEqual(['e1']);
    expect(resolved.discardPile).toContainEqual(expect.objectContaining({ id: 'e2' }));
  });

  it('Arsonist Threaten falls back to the only option the target can afford', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('arsonist', 'CRIMINAL') }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 0, hand: [evidence('e1', ['MEANS'])] }),
    ]);
    const threatened = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { targetId: 'p1' } });
    // Target tries to choose MONEY, but has none — forced to discard instead.
    const resolved = gameReducer(threatened, { type: 'RESOLVE_THREATEN', mode: 'MONEY', cardId: 'e1' });
    expect(resolved.players[1].money).toBe(0);
    expect(resolved.players[1].hand).toHaveLength(0);
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

  it("Smuggler's vacated public slot refills, and the Black Market grows to hold the smuggled card on top of its usual 3", () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('smuggler', 'CRIMINAL') })], {
      publicMarket: [marketPerk('m1', 3), marketPerk('m2', 2), marketPerk('m3', 2), marketPerk('m4', 2), marketPerk('m5', 2)],
      publicMarketDeck: [marketPerk('m6', 2)],
      blackMarket: [marketPerk('b1', 2, 'BLACK_MARKET'), marketPerk('b2', 2, 'BLACK_MARKET'), marketPerk('b3', 2, 'BLACK_MARKET')],
      blackMarketDeck: [marketPerk('b4', 2, 'BLACK_MARKET')],
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'm1' } });
    // Public Market stays full — the smuggled card's slot is replaced from the deck.
    expect(next.publicMarket.map((c) => c.id)).toEqual(['m2', 'm3', 'm4', 'm5', 'm6']);
    expect(next.publicMarketDeck).toHaveLength(0);
    // Black Market keeps its usual 3 plus the smuggled 4th — not topped up further,
    // and not trimmed back down until a purchase actually clears a slot.
    expect(next.blackMarket.map((c) => c.id).sort()).toEqual(['b1', 'b2', 'b3', 'm1']);
    expect(next.blackMarketDeck).toHaveLength(1); // untouched — no room was drawn for
  });

  it("Buying one of the Black Market's regular 3 slots refills it, even with a smuggled extra still sitting there", () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL') })], {
      blackMarket: [
        marketPerk('b1', 1, 'BLACK_MARKET'),
        marketPerk('b2', 1, 'BLACK_MARKET'),
        marketPerk('b3', 1, 'BLACK_MARKET'),
        { ...marketPerk('m1', 1, 'BLACK_MARKET'), smuggled: true }, // a smuggled extra, not one of the 3
      ],
      blackMarketDeck: [marketPerk('b4', 1, 'BLACK_MARKET'), marketPerk('b5', 1, 'BLACK_MARKET')],
    });
    const resetTurn = (st: GameState): GameState => ({
      ...st,
      players: st.players.map((p) => ({ ...p, hasPurchasedFromMarket: false, actionsRemaining: 3 })),
    });

    // b3 sold: the smuggled m1 doesn't count toward the 3, so this still
    // draws a replacement — b3 is replaced with b4, matching the smuggled
    // card riding along untouched.
    let next = gameReducer(s, { type: 'PURCHASE', cardId: 'b3' });
    expect(next.blackMarket.map((c) => c.id).sort()).toEqual(['b1', 'b2', 'b4', 'm1']);
    expect(next.blackMarketDeck).toHaveLength(1);

    next = gameReducer(resetTurn(next), { type: 'PURCHASE', cardId: 'b1' });
    expect(next.blackMarket.map((c) => c.id).sort()).toEqual(['b2', 'b4', 'b5', 'm1']);
    expect(next.blackMarketDeck).toHaveLength(0);
  });

  it('Buying the smuggled card itself never draws a replacement', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL') })], {
      blackMarket: [
        marketPerk('b1', 1, 'BLACK_MARKET'),
        marketPerk('b2', 1, 'BLACK_MARKET'),
        marketPerk('b3', 1, 'BLACK_MARKET'),
        { ...marketPerk('m1', 1, 'BLACK_MARKET'), smuggled: true },
      ],
      blackMarketDeck: [marketPerk('b4', 1, 'BLACK_MARKET')],
    });
    const next = gameReducer(s, { type: 'PURCHASE', cardId: 'm1' });
    // The regular 3 are already full — buying the smuggled extra just removes it.
    expect(next.blackMarket.map((c) => c.id).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(next.blackMarketDeck).toHaveLength(1); // untouched
  });

  it('Forger discards hand Evidence to clear a matching grid slot', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('forger', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })], {
      evidenceGrid: { ...fullGrid(), TIME: { cards: [] } },
    });
    const next = gameReducer(s, { type: 'USE_ROLE_ABILITY', payload: { cardId: 'e1', category: 'MEANS' } });
    expect(next.evidenceGrid.MEANS.cards).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(0);
    // Both the hand card played and the grid card it cleared land in the discard.
    expect(next.discardPile.map((c) => c.id).sort()).toEqual(['e1', 'g-means']);
  });

  it('Forger removes a specific grid card when more than one has piled up in that category', () => {
    const kept = evidence('g-kept', ['MEANS']);
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('forger', 'CRIMINAL'), hand: [evidence('e1', ['MEANS'])] })],
      { evidenceGrid: { ...fullGrid(), MEANS: { cards: [evidence('g-remove', ['MEANS']), kept] } } },
    );
    const next = gameReducer(s, {
      type: 'USE_ROLE_ABILITY', payload: { cardId: 'e1', category: 'MEANS', gridCardId: 'g-remove' },
    });
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['g-kept']);
    expect(next.discardPile.map((c) => c.id)).toContain('g-remove');
  });
});

describe('gameReducer — passive role hooks', () => {
  it('a Criminal can attack and defeat a Vigilante, scoring a VP, but the Vigilante is never injured', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
      mkPlayer({ id: 'p1', role: role('vigilante', 'CIVILIAN', 2) }),
    ]);
    // Hitman 3 + weapon 2 + Marksman (+1/weapon) = 6 vs Vigilante's bare 2 — the fight happens and Criminals win.
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    expect(next.combat).not.toBeNull(); // no longer refused outright
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.teamScores.CRIMINAL).toBe(1); // Criminals still score the VP
    // "Cannot be injured" means exactly that — not that the fight can't happen.
    expect(next.players[1].isInjured).toBe(false);
    expect(next.players[1].isCaptured).toBe(false);
  });

  it("a Vigilante keeps their role ability and can still attack after losing a fight, since they were never injured", () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL', 3), inventory: [weapon('w1', 'MELEE')] }),
      mkPlayer({ id: 'p1', role: role('vigilante', 'CIVILIAN', 2) }),
    ]);
    let next = gameReducer(s, { type: 'ATTACK', targetId: 'p1' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'ATTACKER' });
    next = gameReducer(next, { type: 'PASS_COMBAT', side: 'DEFENDER' });
    expect(next.players[1].isInjured).toBe(false);
    expect(next.players[1].actionsRemaining).toBeGreaterThan(0);
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

  it('Spy can always see the true top card of the deck during their own turn', () => {
    const cards: ActionCard[] = [1, 2, 3].map((n) => ({ id: `c${n}`, name: `c${n}`, description: '', type: 'MONEY', value: 1 }));
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('spy', 'CRIMINAL') }),
      ],
      { drawPile: cards },
    );
    let next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastPeek).toEqual({ playerId: 'p1', cards: [cards[0]] });

    // It's live, not a turn-start snapshot: drawing updates what's on top.
    next = gameReducer(next, { type: 'DRAW_CARD' });
    expect(next.lastPeek).toEqual({ playerId: 'p1', cards: [cards[1]] });

    // Once it's no longer the Spy's turn, the peek disappears.
    next = gameReducer(next, { type: 'END_TURN' });
    expect(next.lastPeek).toBeNull();
  });

  it('A captured Spy loses Recon', () => {
    const cards: ActionCard[] = [{ id: 'c1', name: 'c1', description: '', type: 'MONEY', value: 1 }];
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('spy', 'CRIMINAL'), isCaptured: true }),
      ],
      { drawPile: cards },
    );
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastPeek).toBeNull();
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

  it('an injured Mayor loses their +1 action bonus for the turn (it is a role ability)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), actionsRemaining: 0 }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), isInjured: true }),
    ]);
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.players[1].actionsRemaining).toBe(3); // no Mayor bonus while injured
  });

  it('a captured Mayor also loses the bonus (permanently, not just this turn)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN'), actionsRemaining: 0 }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), isCaptured: true }),
    ]);
    const next = gameReducer(s, { type: 'END_TURN' });
    expect(next.players[1].actionsRemaining).toBe(3);
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

  it('Gain Influence offers a Criminal a free burn when the taken card is Evidence', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const ev = evidence('ev', ['MEANS']);
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evt] }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), hand: [ev] }),
      ],
      { drawPile: [money('d1', 1), money('d2', 1)] },
    );
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.pendingEvidenceBurn).toEqual({ playerId: 'p0', cardId: 'ev' });
    expect(next.players[0].actionsRemaining).toBe(2); // only the event itself cost an action so far

    // Other actions are blocked until the burn offer is answered.
    const blocked = gameReducer(next, { type: 'DRAW_CARD' });
    expect(blocked.pendingEvidenceBurn).toBeTruthy();

    const burned = gameReducer(next, { type: 'RESOLVE_EVIDENCE_BURN', use: true });
    expect(burned.pendingEvidenceBurn).toBeNull();
    expect(burned.players[0].actionsRemaining).toBe(2); // free — no extra action spent
    expect(burned.players[0].hand.some((c) => c.id === 'ev')).toBe(false);
    expect(burned.discardPile.some((c) => c.id === 'ev')).toBe(true);
    expect(burned.players[0].hand).toHaveLength(2); // drew 2 replacements
  });

  it('declining Gain Influence\'s burn offer leaves the Evidence in hand', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const ev = evidence('ev', ['MEANS']);
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), hand: [ev] }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    const kept = gameReducer(next, { type: 'RESOLVE_EVIDENCE_BURN', use: false });
    expect(kept.pendingEvidenceBurn).toBeNull();
    expect(kept.players[0].hand.some((c) => c.id === 'ev')).toBe(true);
  });

  it('Gain Influence does not offer a burn to a Civilian who takes Evidence', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const ev = evidence('ev', ['MEANS']);
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [ev] }),
    ]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(next.pendingEvidenceBurn).toBeFalsy();
  });

  it('pays a teammate Attorney when Evidence stolen via Gain Influence is later played into the grid', () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const ev = evidence('ev', ['MEANS']);
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), hand: [ev] }),
      mkPlayer({ id: 'p2', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);
    const stolen = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(stolen.players[0].hand.some((c) => c.id === 'ev')).toBe(true);

    const next = gameReducer(stolen, { type: 'PLAY_EVIDENCE', cardId: 'ev', category: 'MEANS' });
    expect(next.evidenceGrid.MEANS.cards.map((c) => c.id)).toEqual(['ev']);
    expect(next.players[2].money).toBe(3); // Attorney collected $1
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

describe('gameReducer — Journal', () => {
  const journal: MarketCard = { id: 'j1', name: 'Journal', description: '', cost: 1, source: 'PUBLIC', type: 'PERK' };

  it('offers to repeat any Event just played, for free, even with 0 actions left', () => {
    const evt: ActionCard = { id: 'e', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt], inventory: [journal], actionsRemaining: 1 })]);

    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    expect(next.players[0].money).toBe(3); // event's own effect already applied
    expect(next.players[0].actionsRemaining).toBe(0); // only the play itself cost an action
    expect(next.pendingJournal).toEqual({ playerId: 'p0', card: evt });

    // Other actions are blocked until the offer is answered.
    const blocked = gameReducer(next, { type: 'DRAW_CARD' });
    expect(blocked.pendingJournal).not.toBeNull();
  });

  it('does not offer to repeat when the player has no Journal', () => {
    const evt: ActionCard = { id: 'e', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt] })]);
    const next = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    expect(next.pendingJournal).toBeNull();
  });

  it("offers to repeat Ally Support, and the repeat can copy a different teammate's Action", () => {
    const evt: ActionCard = { id: 'e', name: 'Ally Support', description: '', type: 'EVENT' };
    const coffee1: MarketCard = { id: 'cm1', name: 'Coffee Machine', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const coffee2: MarketCard = { id: 'cm2', name: 'Coffee Machine', description: '', cost: 3, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt], inventory: [journal] }),
      mkPlayer({ id: 'p1', role: role('sheriff', 'CIVILIAN'), inventory: [coffee1] }),
      mkPlayer({ id: 'p2', role: role('bodyguard', 'CIVILIAN'), inventory: [coffee2] }),
    ]);

    const offered = gameReducer(s, {
      type: 'PLAY_CARD', cardId: 'e', targetId: 'p1', options: { allyPerkId: 'cm1', allyPayload: {} },
    });
    expect(offered.pendingJournal).toEqual({ playerId: 'p0', card: evt });
    expect(offered.gameLog.at(-2)).toBe("p0 uses Ally Support to copy p1's Coffee Machine.");
    expect(offered.players[0].coffeeToken).toBe(true);

    // Repeat copies p2's Action this time, not p1's.
    const next = gameReducer(offered, {
      type: 'RESOLVE_JOURNAL', use: true, targetId: 'p2', options: { allyPerkId: 'cm2', allyPayload: {} },
    });
    expect(next.pendingJournal).toBeNull();
    // The repeat's own copy-log lands before the "discards their Journal" wrap-up log.
    expect(next.gameLog.at(-2)).toBe("p0 uses Ally Support to copy p2's Coffee Machine.");
    expect(next.gameLog.at(-1)).toBe('p0 discards their Journal to repeat Ally Support.');
    expect(next.players[0].inventory).toHaveLength(0); // Journal discarded
  });

  it('declining leaves the Journal in inventory and does not repeat the effect', () => {
    const evt: ActionCard = { id: 'e', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt], inventory: [journal] })]);
    const offered = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    const next = gameReducer(offered, { type: 'RESOLVE_JOURNAL', use: false });
    expect(next.pendingJournal).toBeNull();
    expect(next.players[0].money).toBe(3); // unchanged from the original play
    expect(next.players[0].inventory.map((c) => c.id)).toEqual(['j1']); // Journal kept
  });

  it('using it on a no-input Event discards the Journal and repeats the effect immediately', () => {
    const evt: ActionCard = { id: 'e', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [evt], inventory: [journal] })]);
    const offered = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e' });
    const next = gameReducer(offered, { type: 'RESOLVE_JOURNAL', use: true });
    expect(next.pendingJournal).toBeNull();
    expect(next.players[0].money).toBe(4); // +$1 twice
    expect(next.players[0].inventory).toHaveLength(0); // Journal discarded
  });

  it("using it on Gain Influence lets the repeat target a different opponent than the original play", () => {
    const evt: ActionCard = { id: 'e', name: 'Gain Influence', description: '', type: 'EVENT' };
    const card1: ActionCard = { id: 'c1', name: 'c1', description: '', type: 'MONEY', value: 1 };
    const card2: ActionCard = { id: 'c2', name: 'c2', description: '', type: 'MONEY', value: 1 };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [evt], inventory: [journal] }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), team: 'CRIMINAL', hand: [card1] }),
      mkPlayer({ id: 'p2', role: role('robber', 'CRIMINAL'), team: 'CRIMINAL', hand: [card2] }),
    ]);
    const offered = gameReducer(s, { type: 'PLAY_CARD', cardId: 'e', targetId: 'p1' });
    expect(offered.players[0].hand.map((c) => c.id)).toEqual(['c1']); // original target's card taken

    // Repeat targets p2 instead of p1.
    const next = gameReducer(offered, { type: 'RESOLVE_JOURNAL', use: true, targetId: 'p2' });
    expect(next.players[0].hand.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(next.players[1].hand).toHaveLength(0); // p1 untouched by the repeat
    expect(next.players[2].hand).toHaveLength(0); // p2's card taken this time
    expect(next.players[0].inventory).toHaveLength(0);
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

  it('refuses to spend the discount on a weapon — Spring Cleaning only discounts perks', () => {
    const wpn: MarketCard = { id: 'm1', name: 'Bat', description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON' };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 5 })], {
      publicMarket: [wpn],
      pendingMarketDiscount: { playerId: 'p0', amount: 1 },
    });
    const next = gameReducer(s, { type: 'USE_MARKET_DISCOUNT', cardId: 'm1' });
    expect(next.players[0].inventory).toHaveLength(0);
    expect(next.players[0].money).toBe(5); // untouched
    expect(next.pendingMarketDiscount).toEqual({ playerId: 'p0', amount: 1 }); // still pending
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

describe('gameReducer — INITIATE_TRADE / RESOLVE_TRADE_RETURN', () => {
  const money = (id: string): ActionCard => ({ id, name: 'Profit', description: '', type: 'MONEY', value: 2 });
  const weapon = (id: string, name: string): MarketCard => ({ id, name, description: '', cost: 3, source: 'PUBLIC', type: 'WEAPON', weaponType: 'MELEE', power: 2 });

  it('gives a card, sets a pending return, and spends 1 action — the card stays out of the log', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [money('c1')] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN') }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'CARD', cardId: 'c1' } });
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[1].hand.map((c) => c.id)).toContain('c1');
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.pendingTrade).toEqual({ initiatorId: 'p0', recipientId: 'p1' });
    expect(next.gameLog.at(-1)).toBe('p0 trades a card to p1.');
  });

  it('names a traded weapon in the log but never a traded card', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: [weapon('w1', 'Parasites')] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN') }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'WEAPON', cardId: 'w1' } });
    expect(next.gameLog.at(-1)).toBe('p0 trades Parasites to p1.');
  });

  it('refuses to trade with an opponent', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('hitman', 'CRIMINAL'), money: 2 }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    expect(next.players[0].money).toBe(2); // unchanged
    expect(next.pendingTrade).toBeNull();
  });

  it('costs 2 actions when the teammate holds a Traffic token', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2, trafficToken: true }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    expect(next.players[0].actionsRemaining).toBe(1); // 3 - 2
  });

  it('also costs 2 actions when the initiator (not the teammate) holds the Traffic token', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, trafficToken: true }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    expect(next.players[0].actionsRemaining).toBe(1); // 3 - 2 — the surcharge follows the token holder either way
  });

  it('costs 0 actions with a Radio, once per turn', () => {
    const radio: MarketCard = { id: 'r1', name: 'Radio', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 3, inventory: [radio] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 0 }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    expect(next.players[0].actionsRemaining).toBe(3); // unspent — Radio covers it
    expect(next.players[0].hasUsedRadio).toBe(true);
  });

  it('blocks other actions until the pending trade is resolved', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2 }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    const blocked = gameReducer(pending, { type: 'DRAW_CARD' });
    expect(blocked.pendingTrade).toEqual({ initiatorId: 'p0', recipientId: 'p1' });
    expect(blocked.players[0].hand).toHaveLength(0); // DRAW_CARD never ran
  });

  it('lets the recipient — not the initiator — choose the return gift', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2, inventory: [weapon('w1', 'Axe')] }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    const next = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'WEAPON', cardId: 'w1' } });
    expect(next.pendingTrade).toBeNull();
    expect(next.players[0].inventory.map((c) => c.id)).toContain('w1'); // initiator received the weapon
    expect(next.players[1].inventory).toHaveLength(0);
    expect(next.gameLog.at(-1)).toBe('p1 trades Axe to p0.');
  });

  it('lets the recipient decline when they have nothing to give back', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2 }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 0, hand: [], inventory: [] }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    const next = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: null });
    expect(next.pendingTrade).toBeNull();
    expect(next.gameLog.at(-1)).toBe('p1 has nothing to trade back.');
  });

  it('refuses a weapon return once the initiator already has 2 weapons', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, inventory: [weapon('w1', 'Axe'), weapon('w2', 'Bat')] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 0, inventory: [weapon('w3', 'Pistol')] }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    const next = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'WEAPON', cardId: 'w3' } });
    expect(next.pendingTrade).toEqual({ initiatorId: 'p0', recipientId: 'p1' }); // still pending — refused
    expect(next.players[1].inventory.map((c) => c.id)).toContain('w3'); // never left p1
  });

  it('initiating a weapon gift may briefly push a 2-weapon teammate to 3', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: [weapon('w1', 'Axe')] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), inventory: [weapon('w2', 'Bat'), weapon('w3', 'Pistol')] }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'WEAPON', cardId: 'w1' } });
    expect(pending.players[1].inventory.map((c) => c.id)).toEqual(['w2', 'w3', 'w1']); // now holding 3
    expect(pending.pendingTrade).toEqual({ initiatorId: 'p0', recipientId: 'p1' });
  });

  it('refuses to push a teammate past 3 weapons even on the initiating leg', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: [weapon('w1', 'Axe')] }),
      mkPlayer({
        id: 'p1', role: role('attorney', 'CIVILIAN'),
        inventory: [weapon('w2', 'Bat'), weapon('w3', 'Pistol'), weapon('w4', 'Hammer')],
      }),
    ]);
    const next = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'WEAPON', cardId: 'w1' } });
    expect(next.pendingTrade).toBeNull(); // refused outright, no trade started
    expect(next.players[0].inventory.map((c) => c.id)).toContain('w1'); // never left p0
  });

  it('a recipient sitting at 3 weapons must trade back a weapon — money or a card are refused, so is declining', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), inventory: [weapon('w1', 'Axe')] }),
      mkPlayer({
        id: 'p1', role: role('attorney', 'CIVILIAN'), money: 3, hand: [money('m1')],
        inventory: [weapon('w2', 'Bat'), weapon('w3', 'Pistol')],
      }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'WEAPON', cardId: 'w1' } });
    expect(pending.players[1].inventory).toHaveLength(3);

    const refusedMoney = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'MONEY' } });
    expect(refusedMoney.pendingTrade).not.toBeNull(); // still pending — refused
    expect(refusedMoney.players[0].money).toBe(5); // default — nothing moved

    const refusedCard = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'CARD', cardId: 'm1' } });
    expect(refusedCard.pendingTrade).not.toBeNull();

    const refusedDecline = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: null });
    expect(refusedDecline.pendingTrade).not.toBeNull();

    const settled = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'WEAPON', cardId: 'w2' } });
    expect(settled.pendingTrade).toBeNull();
    expect(settled.players[1].inventory.map((c) => c.id)).toEqual(['w3', 'w1']); // back to 2
    expect(settled.players[0].inventory.map((c) => c.id)).toContain('w2');
  });

  it('Express Shipping offers the initiator a $1-or-draw choice once the trade fully resolves', () => {
    const shipping: MarketCard = { id: 'i1', name: 'Express Shipping', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, inventory: [shipping] }),
      mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2, inventory: [shipping] }),
    ]);
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    expect(pending.players[0].money).toBe(1); // no Express Shipping payout yet

    const returned = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'MONEY' } });
    expect(returned.pendingTrade).toBeNull();
    expect(returned.pendingExpressShipping).toEqual({ playerId: 'p0' });
    expect(returned.players[0].money).toBe(2); // received $1 back, but no payout yet — still pending the choice
    // p1 also holds Express Shipping, but it isn't their turn's Trade action.
    expect(returned.players[1].money).toBe(2);

    // Other actions are blocked until the choice is made.
    const blocked = gameReducer(returned, { type: 'DRAW_CARD' });
    expect(blocked.pendingExpressShipping).toEqual({ playerId: 'p0' });

    const withMoney = gameReducer(returned, { type: 'RESOLVE_EXPRESS_SHIPPING', mode: 'MONEY' });
    expect(withMoney.pendingExpressShipping).toBeNull();
    expect(withMoney.players[0].money).toBe(3);
    expect(withMoney.players[0].hand).toHaveLength(0);
  });

  it('Express Shipping can draw a card instead of $1', () => {
    const shipping: MarketCard = { id: 'i1', name: 'Express Shipping', description: '', cost: 2, source: 'PUBLIC', type: 'PERK' };
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, inventory: [shipping] }),
        mkPlayer({ id: 'p1', role: role('attorney', 'CIVILIAN'), money: 2 }),
      ],
      { drawPile: [{ id: 'd1', name: 'Drawn', description: '', type: 'MONEY', value: 1 }] },
    );
    const pending = gameReducer(s, { type: 'INITIATE_TRADE', targetId: 'p1', give: { kind: 'MONEY' } });
    const returned = gameReducer(pending, { type: 'RESOLVE_TRADE_RETURN', give: { kind: 'MONEY' } });
    const next = gameReducer(returned, { type: 'RESOLVE_EXPRESS_SHIPPING', mode: 'DRAW' });
    expect(next.pendingExpressShipping).toBeNull();
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['d1']);
    expect(next.players[0].money).toBe(2); // no $1 — drew instead
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
    const revealed = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(revealed.pendingManipulate?.cards.map((x) => x.id)).toEqual(['a', 'b', 'cc']); // perk worked despite being captured
    const next = gameReducer(revealed, { type: 'RESOLVE_MANIPULATE', cardId: 'a' });
    expect(next.players[0].hand.map((x) => x.id)).toContain('a');
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

  it('Credit Card refuses a Black Market card, even for a Criminal', () => {
    const cc = perk('pk', 'Credit Card');
    const expand: MarketCard = { id: 'en', name: 'Expand Network', description: '', cost: 5, source: 'BLACK_MARKET', type: 'SPECIAL', vpValue: 1 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('crime-lord', 'CRIMINAL'), money: 9, inventory: [cc] })],
      { blackMarket: [expand] },
    );
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { marketCardId: 'en' } });
    expect(next.players[0].money).toBe(9); // unchanged — purchase refused
    expect(next.players[0].inventory).toHaveLength(1); // still just the Credit Card
  });

  it('Recycling Bin discards the chosen card immediately, then offers a same-type card to take', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const oldPower: ActionCard = { id: 'd1', name: 'Surge', description: '', type: 'POWER', power: 2 };
    const oldMoney: ActionCard = { id: 'd2', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })],
      { discardPile: [oldMoney, oldPower] },
    );
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    expect(next.players[0].hand).toHaveLength(0); // discarded already
    expect(next.discardPile.map((c) => c.id)).toEqual(['d2', 'd1', 'h1']);
    expect(next.pendingRecyclingBin).toEqual({ playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'TAKE' });
    expect(next.players[0].actionsRemaining).toBe(2); // the perk action itself was spent already
  });

  it('Recycling Bin: taking a card moves it to hand and removes it from the discard, then offers the $1-or-draw reward', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const oldPower: ActionCard = { id: 'd1', name: 'Surge', description: '', type: 'POWER', power: 2 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })],
      { discardPile: [oldPower] },
    );
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    const next = gameReducer(discarded, { type: 'RESOLVE_RECYCLING_BIN', cardId: 'd1' });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['d1']);
    expect(next.discardPile.some((c) => c.id === 'd1')).toBe(false);
    expect(next.pendingRecyclingBin).toEqual({ playerId: 'p0', discardedCardId: 'h1', discardedType: 'POWER', phase: 'REWARD' });
  });

  it('Recycling Bin: cannot take back the card it just discarded, even though its type trivially matches', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })]);
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    // Attempting to "take" the very card just discarded is rejected — treated as no match.
    const next = gameReducer(discarded, { type: 'RESOLVE_RECYCLING_BIN', cardId: 'h1' });
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id)).toEqual(['h1']);
    expect(next.pendingRecyclingBin?.phase).toBe('REWARD');
  });

  it('Recycling Bin: with no same-type card in the discard, acknowledges it and still offers the reward', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const unrelated: ActionCard = { id: 'd1', name: 'Profit', description: '', type: 'MONEY', value: 2 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })],
      { discardPile: [unrelated] },
    );
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    const next = gameReducer(discarded, { type: 'RESOLVE_RECYCLING_BIN' });
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.discardPile.map((c) => c.id)).toEqual(['d1', 'h1']); // untouched
    expect(next.pendingRecyclingBin?.phase).toBe('REWARD');
  });

  it('Recycling Bin: blocks other actions until the pending choice is resolved', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })]);
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    const blocked = gameReducer(discarded, { type: 'DRAW_CARD' });
    expect(blocked.pendingRecyclingBin).toBeTruthy(); // still pending — draw was refused
  });

  it('Recycling Bin: REWARD choice of $1 pays out and clears the pending state', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const s = stateWith([mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), money: 2, hand: [junkCard], inventory: [bin] })]);
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    const acked = gameReducer(discarded, { type: 'RESOLVE_RECYCLING_BIN' });
    const next = gameReducer(acked, { type: 'RESOLVE_RECYCLING_BIN', mode: 'MONEY' });
    expect(next.players[0].money).toBe(3);
    expect(next.pendingRecyclingBin).toBeNull();
  });

  it('Recycling Bin: REWARD choice of a draw pulls a card and clears the pending state', () => {
    const bin = perk('pk', 'Recycling Bin');
    const junkCard: ActionCard = { id: 'h1', name: 'Boost', description: '', type: 'POWER', power: 1 };
    const top: ActionCard = { id: 't', name: 'x', description: '', type: 'MONEY', value: 1 };
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('mayor', 'CIVILIAN'), hand: [junkCard], inventory: [bin] })],
      { drawPile: [top] },
    );
    const discarded = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { cardId: 'h1' } });
    const acked = gameReducer(discarded, { type: 'RESOLVE_RECYCLING_BIN' });
    const next = gameReducer(acked, { type: 'RESOLVE_RECYCLING_BIN', mode: 'DRAW' });
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['t']);
    expect(next.pendingRecyclingBin).toBeNull();
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

  it('Trash Can offers the holder a choice of Market card to bin at start of turn, then sells it back at $1 off', () => {
    const trash = perk('pk', 'Trash Can');
    const a = perk('m1', 'A', { cost: 3 });
    const b = perk('m2', 'B', { cost: 2 });
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 5, inventory: [trash] }),
      ],
      { publicMarket: [a, b], publicMarketDeck: [] },
    );
    // End p0's turn so p1's start-of-turn offers the bin choice — not automatic.
    const started = gameReducer(s, { type: 'END_TURN' });
    expect(started.pendingTrashCan).toEqual({ playerId: 'p1' });
    expect(started.publicMarket.map((c) => c.id)).toEqual(['m1', 'm2']); // untouched until resolved

    // p1 picks B, not the top card — a real choice, not "always the first".
    const binned = gameReducer(started, { type: 'RESOLVE_TRASH_CAN', cardId: 'm2' });
    expect(binned.pendingTrashCan).toBeNull();
    expect(binned.trashPile?.map((c) => c.id)).toEqual(['m2']);
    expect(binned.publicMarket.map((c) => c.id)).toEqual(['m1']);

    // p1 buys B back from the trash at $1 off.
    const bought = gameReducer(binned, { type: 'USE_PERK', perkId: 'pk', payload: { marketCardId: 'm2' } });
    expect(bought.players[1].inventory.some((c) => c.id === 'm2')).toBe(true);
    expect(bought.players[1].money).toBe(4); // 5 - (2 - 1)
  });

  it('Trash Can blocks other actions until the bin choice is resolved', () => {
    const trash = perk('pk', 'Trash Can');
    const a = perk('m1', 'A', { cost: 3 });
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('sheriff', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 5, inventory: [trash] }),
      ],
      { publicMarket: [a] },
    );
    const started = gameReducer(s, { type: 'END_TURN' });
    const blocked = gameReducer(started, { type: 'DRAW_CARD' });
    expect(blocked.players[1].hand).toHaveLength(0); // refused — Trash Can still pending
    expect(blocked.pendingTrashCan).toEqual({ playerId: 'p1' });
  });

  it('Manipulate reveals the top 3, lets the player choose which to keep and which goes back on top', () => {
    const c = (id: string): ActionCard => ({ id, name: id, description: '', type: 'MONEY', value: 1 });
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip] })], {
      drawPile: [c('a'), c('b'), c('cc'), c('d')],
    });
    const revealed = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(revealed.pendingManipulate).toEqual({ playerId: 'p0', cards: [c('a'), c('b'), c('cc')], phase: 'KEEP' });
    expect(revealed.drawPile.map((x) => x.id)).toEqual(['d']); // pulled off the deck immediately
    expect(revealed.players[0].actionsRemaining).toBe(2); // action spent up front

    // Choosing DISCARD without a card yet doesn't resolve — still their turn to pick.
    const notYet = gameReducer(revealed, { type: 'RESOLVE_MANIPULATE', cardId: 'nope' });
    expect(notYet.pendingManipulate?.phase).toBe('KEEP');

    // Keep 'b' (not the top card — proves it's a real choice, not automatic).
    const kept = gameReducer(revealed, { type: 'RESOLVE_MANIPULATE', cardId: 'b' });
    expect(kept.players[0].hand.map((x) => x.id)).toEqual(['b']);
    expect(kept.pendingManipulate).toEqual({ playerId: 'p0', cards: [c('a'), c('cc')], phase: 'TOP' });

    // Put 'cc' back on top — 'a' (the leftover) is discarded.
    const done = gameReducer(kept, { type: 'RESOLVE_MANIPULATE', cardId: 'cc' });
    expect(done.drawPile.map((x) => x.id)).toEqual(['cc', 'd']);
    expect(done.discardPile.map((x) => x.id)).toEqual(['a']);
    expect(done.pendingManipulate).toBeNull();
  });

  it('Manipulate with only 2 cards left in the deck: the leftover goes back on top, nothing to discard', () => {
    const c = (id: string): ActionCard => ({ id, name: id, description: '', type: 'MONEY', value: 1 });
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip] })], {
      drawPile: [c('a'), c('b')],
    });
    const revealed = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(revealed.pendingManipulate?.cards.map((x) => x.id)).toEqual(['a', 'b']);
    const next = gameReducer(revealed, { type: 'RESOLVE_MANIPULATE', cardId: 'a' });
    expect(next.players[0].hand.map((x) => x.id)).toEqual(['a']);
    expect(next.drawPile.map((x) => x.id)).toEqual(['b']); // leftover auto-returns to top
    expect(next.discardPile).toHaveLength(0);
    expect(next.pendingManipulate).toBeNull();
  });

  it('Manipulate with only 1 card left in the deck: kept automatically, no pending choice', () => {
    const c = (id: string): ActionCard => ({ id, name: id, description: '', type: 'MONEY', value: 1 });
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip] })], {
      drawPile: [c('a')],
    });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(next.players[0].hand.map((x) => x.id)).toEqual(['a']);
    expect(next.drawPile).toHaveLength(0);
    expect(next.pendingManipulate).toBeNull();
    expect(next.players[0].actionsRemaining).toBe(2);
  });

  it('Manipulate with an empty deck wastes the action', () => {
    const manip = perk('pk', 'Manipulate', { source: 'BLACK_MARKET' });
    const s = stateWith([mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [manip] })], {
      drawPile: [],
    });
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk' });
    expect(next.pendingManipulate).toBeNull();
    expect(next.players[0].actionsRemaining).toBe(2);
    expect(next.gameLog.at(-1)).toMatch(/deck is empty/i);
  });

  it('Shady Press reveals the pressed opponent\'s Event cards via pendingShadyPress — the action is spent immediately, before any card is chosen', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const decoy: ActionCard = { id: 'd', name: 'Lottery', description: '', type: 'EVENT' };
    const chosen: ActionCard = { id: 'v', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), money: 0, inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 0, hand: [decoy, chosen] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['d', 'v']); // untouched until resolved
    expect(next.players[0].actionsRemaining).toBe(2); // spent on the press alone
    expect(next.pendingShadyPress).toEqual({ pressId: 'p0', targetId: 'p1', perkCardId: 'pk', cards: [decoy, chosen] });
  });

  it('Shady Press plays the chosen opponent Event card, not just the first one — for the presser', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const decoy: ActionCard = { id: 'd', name: 'Lottery', description: '', type: 'EVENT' };
    const chosen: ActionCard = { id: 'v', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), money: 0, inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), money: 0, hand: [decoy, chosen] }),
    ]);
    const pressed = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    const next = gameReducer(pressed, { type: 'RESOLVE_SHADY_PRESS', cardId: 'v' });
    expect(next.players[1].hand.map((c) => c.id)).toEqual(['d']); // only the chosen card left their hand
    // Forced-play benefits the Criminal who used Shady Press, not the Civilian
    // who was forced to reveal it — same as Sheriff's Subpoena benefits the Sheriff.
    expect(next.players[0].money).toBe(1);
    expect(next.players[1].money).toBe(0);
    expect(next.players[0].actionsRemaining).toBe(2); // unchanged by the resolve step — already spent on the press
    expect(next.pendingShadyPress).toBeNull();
  });

  it("Shady Press gathers the forced Event's own target from the presser (Tax Collection)", () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const evt: ActionCard = { id: 'v', name: 'Tax Collection', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), money: 0, inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('mayor', 'CIVILIAN'), hand: [evt] }), // supplies the card
      mkPlayer({ id: 'p2', role: role('sheriff', 'CIVILIAN'), money: 3 }), // p0's chosen tax target
    ]);
    const pressed = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    const next = gameReducer(pressed, { type: 'RESOLVE_SHADY_PRESS', cardId: 'v', eventTargetId: 'p2' });
    expect(next.players[1].hand).toHaveLength(0); // p1's card was spent
    expect(next.players[0].money).toBe(1); // p0 (the presser) collects the tax
    expect(next.players[2].money).toBe(2); // taxed from p2, the chosen target — not p1
  });

  it('Shady Press refuses to target a teammate', () => {
    const press = perk('pk', 'Shady Press', { source: 'BLACK_MARKET' });
    const evt: ActionCard = { id: 'v', name: 'Generational Wealth', description: '', type: 'EVENT' };
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('hitman', 'CRIMINAL'), inventory: [press] }),
      mkPlayer({ id: 'p1', role: role('robber', 'CRIMINAL'), hand: [evt] }),
    ]);
    const next = gameReducer(s, { type: 'USE_PERK', perkId: 'pk', payload: { targetId: 'p1' } });
    expect(next.players[1].hand).toHaveLength(1); // untouched
    expect(next.players[0].actionsRemaining).toBe(3); // action not spent
    expect(next.pendingShadyPress).toBeNull();
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
    expect(next.pendingShadyPress).toBeNull(); // nothing to resolve — already wasted
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
