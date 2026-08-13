import { useReducer } from 'react';

import type { 
    GameState, 
    Player, 
    PlayerActionType 
  } from '../types/game';

  import type { 
    ActionCard, 
    MarketCard, 
    Team, 
    EvidenceCategory 
  } from '../types/cards';

import { ROLES } from '../constants/roles';
import { GAME_CONFIGS } from '../constants/setup';

// --- ACTION TYPES ---
type GameAction =
  | { type: 'START_GAME'; playerNames: string[] }
  | { type: 'PERFORM_ACTION'; actionType: PlayerActionType; targetId?: string; cardId?: string }
  | { type: 'PLAY_EVIDENCE'; cardId: string; category: EvidenceCategory }
  | { type: 'CONVICT_CRIMINAL'; targetId: string }
  | { type: 'END_TURN' };

// --- INITIAL STATE ---
const initialGrid = {
  TIME: { isFilled: false, cardName: null },
  MEANS: { isFilled: false, cardName: null },
  LOCATION: { isFilled: false, cardName: null },
  MOTIVE: { isFilled: false, cardName: null },
};

const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  drawPile: [],
  discardPile: [],
  publicMarket: [],
  blackMarket: [],
  evidenceGrid: initialGrid,
  teamScores: { CIVILIAN: 0, CRIMINAL: 0 },
  vpTargets: { CIVILIAN: 0, CRIMINAL: 0 },
  gameLog: ["Waiting for players..."],
  winner: null,
};

// --- REDUCER ---
function gameReducer(state: GameState, action: GameAction): GameState {
  const currentPlayer = state.players[state.currentPlayerIndex];

  switch (action.type) {
    case 'START_GAME': {
      const count = action.playerNames.length;
      const config = GAME_CONFIGS[count];
      if (!config) return state;

      // Prepare Decks & Roles
      let actionDeck = shuffle(generateActionCards());
      const civRoles = shuffle(ROLES.filter(r => r.team === 'CIVILIAN'));
      const crimRoles = shuffle(ROLES.filter(r => r.team === 'CRIMINAL'));

      // Assign Players
      const players: Player[] = action.playerNames.map((name, i) => {
        const team: Team = i < config.criminals ? 'CRIMINAL' : 'CIVILIAN';
        const role = team === 'CRIMINAL' ? crimRoles.pop()! : civRoles.pop()!;
        const setup = team === 'CIVILIAN' ? config.civSetup : config.crimSetup;
        
        const hand = actionDeck.slice(0, setup.startingCards);
        actionDeck = actionDeck.slice(setup.startingCards);

        return {
          id: `p${i}`,
          name, team, role, hand,
          inventory: [],
          money: setup.startingMoney,
          actionsRemaining: 3,
          isInjured: false,
          isCaptured: false,
          hasPurchasedFromMarket: false,
          hasUsedRoleAbility: false,
          isEliminated: false,
          convictedTokens: 0,
        };
      });

      return {
        ...state,
        players: shuffle(players),
        drawPile: actionDeck,
        vpTargets: config.vpTargets,
        teamScores: { CIVILIAN: 0, CRIMINAL: 0 },
        gameLog: ["The Rush begins!"],
      };
    }

    case 'PERFORM_ACTION': {
      const { actionType } = action;
      let cost = 1;
      if (actionType === 'COMBAT') cost = 2;

      // 1. AP Check
      if (currentPlayer.actionsRemaining < cost) return state;

      // 2. Status Blocks
      if (currentPlayer.isInjured && (actionType === 'ROLE_ABILITY' || actionType === 'SPECIAL_GOAL')) {
         return log(state, "You are injured and cannot use abilities!");
      }
      if (currentPlayer.isCaptured && (actionType === 'COMBAT' || actionType === 'SPECIAL_GOAL')) {
         return log(state, "Captured criminals are restricted!");
      }

      // 3. Action Logic
      let newState = { ...state };
      if (actionType === 'SPECIAL_GOAL') {
        const team = currentPlayer.team;
        newState = updateScore(state, team, 1, `${currentPlayer.name} advanced their objective!`);
      }

      // Update AP
      const updatedPlayers = [...newState.players];
      updatedPlayers[state.currentPlayerIndex] = {
        ...currentPlayer,
        actionsRemaining: currentPlayer.actionsRemaining - cost
      };

      return { ...newState, players: updatedPlayers };
    }

    case 'PLAY_EVIDENCE': {
      const { cardId, category } = action;
      const card = currentPlayer.hand.find(c => c.id === cardId);

      if (!card || card.type !== 'EVIDENCE' || !card.evidenceCategories?.includes(category)) return state;
      if (state.evidenceGrid[category].isFilled || currentPlayer.actionsRemaining < 1) return state;

      const newGrid = { ...state.evidenceGrid, [category]: { isFilled: true, cardName: card.name } };
      const newHand = currentPlayer.hand.filter(c => c.id !== cardId);

      const newPlayers = [...state.players];
      newPlayers[state.currentPlayerIndex] = { 
        ...currentPlayer, 
        hand: newHand, 
        actionsRemaining: currentPlayer.actionsRemaining - 1 
      };

      return { ...state, players: newPlayers, evidenceGrid: newGrid };
    }

    case 'CONVICT_CRIMINAL': {
      const isGridFull = Object.values(state.evidenceGrid).every(s => s.isFilled);
      if (!isGridFull || currentPlayer.actionsRemaining < 1) return state;

      const newPlayers = state.players.map(p => {
        if (p.id === action.targetId) return { ...p, convictedTokens: p.convictedTokens + 1 };
        if (p.id === currentPlayer.id) return { ...p, actionsRemaining: p.actionsRemaining - 1 };
        return p;
      });

      return updateScore({ ...state, players: newPlayers, evidenceGrid: initialGrid }, 'CIVILIAN', 1, "A Criminal has been Convicted!");
    }

    case 'END_TURN': {
      const updatedPlayers = [...state.players];
      const p = { ...updatedPlayers[state.currentPlayerIndex] };
      
      if (p.team === 'CIVILIAN') p.isInjured = false; // Auto-heal
      p.actionsRemaining = 3;
      p.hasPurchasedFromMarket = false;
      p.hasUsedRoleAbility = false;

      updatedPlayers[state.currentPlayerIndex] = p;

      return {
        ...state,
        players: updatedPlayers,
        currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
      };
    }

    default:
      return state;
  }
}

// --- HELPERS ---
function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }

function log(state: GameState, msg: string): GameState {
  return { ...state, gameLog: [...state.gameLog, msg] };
}

function updateScore(state: GameState, team: Team, pts: number, msg: string): GameState {
  const newScores = { ...state.teamScores, [team]: state.teamScores[team] + pts };
  
  // Tie breaker: Civilians checked first
  let winner = state.winner;
  if (newScores.CIVILIAN >= state.vpTargets.CIVILIAN) winner = 'CIVILIAN';
  else if (newScores.CRIMINAL >= state.vpTargets.CRIMINAL) winner = 'CRIMINAL';

  return { ...state, teamScores: newScores, winner, gameLog: [...state.gameLog, msg] };
}

function generateActionCards(): ActionCard[] {
  // Prototype filler logic
  return Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`,
    name: i % 5 === 0 ? "Evidence: DNA" : "Action Card",
    description: "Effect here",
    type: i % 5 === 0 ? 'EVIDENCE' : 'MOVEMENT',
    evidenceCategories: i % 5 === 0 ? ['MEANS', 'LOCATION'] : undefined
  }));
}

export function useGameState() {
  return useReducer(gameReducer, initialState);
}