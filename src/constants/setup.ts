// src/constants/setup.ts

import type { Team } from '../types/cards';

interface RoleSetup {
  startingCards: number;
  startingMoney: number;
}

interface PlayerCountConfig {
  civilians: number;
  criminals: number;
  vpTargets: Record<Team, number>;
  civSetup: RoleSetup;
  crimSetup: RoleSetup;
}

export const GAME_CONFIGS: Record<number, PlayerCountConfig> = {
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