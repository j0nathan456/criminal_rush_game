// src/constants/setup.ts

import type { GameConfig } from '../types/game.js';

export const GAME_CONFIGS: Record<number, GameConfig> = {
  4: {
    civilians: 2,
    criminals: 2,
    vpTargets: { CIVILIAN: 4, CRIMINAL: 5 },
    civSetup: { startingCards: 5, startingMoney: 2 },
    crimSetup: { startingCards: 3, startingMoney: 2 }
  },
  5: {
    civilians: 3,
    criminals: 2,
    vpTargets: { CIVILIAN: 5, CRIMINAL: 5 },
    civSetup: { startingCards: 3, startingMoney: 2 },
    crimSetup: { startingCards: 3, startingMoney: 2 }
  },
  6: {
    civilians: 3,
    criminals: 3,
    vpTargets: { CIVILIAN: 6, CRIMINAL: 6 },
    civSetup: { startingCards: 5, startingMoney: 3 },
    crimSetup: { startingCards: 3, startingMoney: 2 }
  },
  7: {
    civilians: 4,
    criminals: 3,
    vpTargets: { CIVILIAN: 6, CRIMINAL: 6 },
    civSetup: { startingCards: 3, startingMoney: 3 },
    crimSetup: { startingCards: 3, startingMoney: 2 }
  },
  8: {
    civilians: 4,
    criminals: 4,
    vpTargets: { CIVILIAN: 8, CRIMINAL: 8 },
    civSetup: { startingCards: 5, startingMoney: 3 },
    crimSetup: { startingCards: 3, startingMoney: 2 }
  }
};