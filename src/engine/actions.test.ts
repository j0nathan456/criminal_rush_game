import { describe, it, expect } from 'vitest';
import type { GameState, Player, RoleIdentity } from '../types/game.js';
import type { ActionCard, MarketCard, Team } from '../types/cards.js';
import { emptyGameState } from './reducer.js';
import { actionAvailability, handCardPlayable } from './actions.js';

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

const evidenceCard: ActionCard = { id: 'x', name: 'x', description: '', type: 'EVIDENCE' };
const fullGrid = () => ({
  TIME: { cards: [evidenceCard] },
  MEANS: { cards: [evidenceCard] },
  LOCATION: { cards: [evidenceCard] },
  MOTIVE: { cards: [evidenceCard] },
});

const perk = (name: string): MarketCard => ({ id: name, name, description: '', type: 'PERK', cost: 2, source: 'PUBLIC' });

describe('actionAvailability — Combat', () => {
  it('is enabled when a legal target exists (Criminal vs unhurt Civilian neighbor)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL') }),
      mkPlayer({ id: 'p1', role: role('citizen', 'CIVILIAN') }),
    ]);
    expect(actionAvailability(s, 0).COMBAT).toEqual({ enabled: true });
  });

  it('is disabled with a reason when no valid target exists (Civilian, no exposed Criminal)', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('detective', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('boss', 'CRIMINAL') }), // not exposed → cannot be attacked
    ]);
    const combat = actionAvailability(s, 0).COMBAT;
    expect(combat?.enabled).toBe(false);
    expect(combat?.reason).toMatch(/no valid target/i);
  });

  it('is disabled once the player has attacked this turn', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), hasAttacked: true }),
      mkPlayer({ id: 'p1', role: role('citizen', 'CIVILIAN') }),
    ]);
    const combat = actionAvailability(s, 0).COMBAT;
    expect(combat?.enabled).toBe(false);
    expect(combat?.reason).toMatch(/already attacked/i);
  });
});

describe('actionAvailability — Expose (SPECIAL_GOAL)', () => {
  it('is disabled while the evidence grid is incomplete', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('detective', 'CIVILIAN') }),
      mkPlayer({ id: 'p1', role: role('boss', 'CRIMINAL') }),
    ]);
    const goal = actionAvailability(s, 0).SPECIAL_GOAL;
    expect(goal?.enabled).toBe(false);
    expect(goal?.reason).toMatch(/grid is not full/i);
  });

  it('is enabled with a full grid and an exposable Criminal', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('detective', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('boss', 'CRIMINAL') }),
      ],
      { evidenceGrid: fullGrid() },
    );
    expect(actionAvailability(s, 0).SPECIAL_GOAL).toEqual({ enabled: true });
  });

  it('is disabled when the grid is full but every Criminal is already exposed', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('detective', 'CIVILIAN') }),
        mkPlayer({ id: 'p1', role: role('boss', 'CRIMINAL'), isExposed: true }),
      ],
      { evidenceGrid: fullGrid() },
    );
    const goal = actionAvailability(s, 0).SPECIAL_GOAL;
    expect(goal?.enabled).toBe(false);
    expect(goal?.reason).toMatch(/no criminal left/i);
  });

  const expandNetwork: MarketCard = { id: 'en', name: 'Expand Network', description: '', type: 'SPECIAL', cost: 5, source: 'BLACK_MARKET', vpValue: 1 };

  it('is enabled for a Criminal who can afford the current Expand Network price', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), money: 5 })], { blackMarket: [expandNetwork] });
    expect(actionAvailability(s, 0).SPECIAL_GOAL).toEqual({ enabled: true });
  });

  it('is disabled when no Expand Network card is currently available', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), money: 99 })], { blackMarket: [] });
    const goal = actionAvailability(s, 0).SPECIAL_GOAL;
    expect(goal?.enabled).toBe(false);
    expect(goal?.reason).toMatch(/no expand network/i);
  });

  it('is disabled for a Criminal who cannot afford it', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), money: 4 })], { blackMarket: [expandNetwork] });
    const goal = actionAvailability(s, 0).SPECIAL_GOAL;
    expect(goal?.enabled).toBe(false);
    expect(goal?.reason).toMatch(/not enough money.*\$5/i);
  });

  it('folds in the captured Weakened Network surcharge before checking affordability', () => {
    const s = stateWith(
      [mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), money: 5, isCaptured: true })],
      { blackMarket: [expandNetwork] },
    );
    const goal = actionAvailability(s, 0).SPECIAL_GOAL;
    expect(goal?.enabled).toBe(false);
    expect(goal?.reason).toMatch(/not enough money.*\$6/i); // $5 base + $1 captured
  });
});

describe('actionAvailability — once-per-turn and resource gates', () => {
  it('disables Buy after purchasing and Role Action after using it', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), hasPurchasedFromMarket: true, hasUsedRoleAbility: true }),
    ]);
    const a = actionAvailability(s, 0);
    expect(a.PURCHASE_MARKET?.enabled).toBe(false);
    expect(a.ROLE_ABILITY?.enabled).toBe(false);
  });

  it('disables Role Action for a captured player', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), isCaptured: true })]);
    expect(actionAvailability(s, 0).ROLE_ABILITY?.enabled).toBe(false);
  });

  it('disables Role Action for an injured player', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('detective', 'CIVILIAN'), isInjured: true })]);
    const roleAbility = actionAvailability(s, 0).ROLE_ABILITY;
    expect(roleAbility?.enabled).toBe(false);
    expect(roleAbility?.reason).toMatch(/injured/i);
  });

  it('disables Play Card with an empty hand and Sell with no sellable items', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), hand: [], inventory: [] }),
    ]);
    const a = actionAvailability(s, 0);
    expect(a.PLAY_CARD?.enabled).toBe(false);
    expect(a.SELL_ITEM?.enabled).toBe(false);
  });

  it('enables Sell when a sellable item is present', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), inventory: [perk('Bodyguard')] }),
    ]);
    expect(actionAvailability(s, 0).SELL_ITEM).toEqual({ enabled: true });
  });
});

describe('actionAvailability — Perk Action', () => {
  it('is disabled when the player owns no actionable perk', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), inventory: [perk('Mafia Alliance')] })]);
    const perkAction = actionAvailability(s, 0).PERK_ACTION;
    expect(perkAction?.enabled).toBe(false);
    expect(perkAction?.reason).toMatch(/no actionable perk/i);
  });

  it('is enabled when the player owns an actionable perk', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), inventory: [perk('Bank')] })]);
    expect(actionAvailability(s, 0).PERK_ACTION).toEqual({ enabled: true });
  });

  it('is disabled once every actionable perk has already been used this turn', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), inventory: [perk('Bank')], usedPerkIds: ['Bank'] }),
    ]);
    expect(actionAvailability(s, 0).PERK_ACTION?.enabled).toBe(false);
  });

  it('stays enabled for an injured or captured player — only role abilities are stripped, not perk actions', () => {
    const s = stateWith([
      mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL'), inventory: [perk('Bank')], isInjured: true, isCaptured: true }),
    ]);
    expect(actionAvailability(s, 0).PERK_ACTION).toEqual({ enabled: true });
  });
});

describe('handCardPlayable', () => {
  const card = (type: ActionCard['type']): ActionCard => ({ id: type, name: type, description: '', type });

  it('allows Money and Event cards on your turn', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL') })]);
    expect(handCardPlayable(s, 0, card('MONEY')).enabled).toBe(true);
    expect(handCardPlayable(s, 0, card('EVENT')).enabled).toBe(true);
    expect(handCardPlayable(s, 0, card('EVIDENCE')).enabled).toBe(true);
  });

  it('blocks Power cards outside combat but allows them during a fight', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL') })]);
    const blocked = handCardPlayable(s, 0, card('POWER'));
    expect(blocked.enabled).toBe(false);
    expect(blocked.reason).toMatch(/only be played during combat/i);

    const inCombat = handCardPlayable({ ...s, combat: {} as GameState['combat'] }, 0, card('POWER'));
    expect(inCombat.enabled).toBe(true);
  });

  it('blocks non-Power cards while a combat is unresolved', () => {
    const s = stateWith([mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL') })], {
      combat: {} as GameState['combat'],
    });
    expect(handCardPlayable(s, 0, card('MONEY')).enabled).toBe(false);
  });

  it('blocks every card when it is not your turn', () => {
    const s = stateWith(
      [
        mkPlayer({ id: 'p0', role: role('boss', 'CRIMINAL') }),
        mkPlayer({ id: 'p1', role: role('citizen', 'CIVILIAN') }),
      ],
      { currentPlayerIndex: 0 },
    );
    const off = handCardPlayable(s, 1, card('MONEY'));
    expect(off.enabled).toBe(false);
    expect(off.reason).toMatch(/your turn/i);
  });
});
