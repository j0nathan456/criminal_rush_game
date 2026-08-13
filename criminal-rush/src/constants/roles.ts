import type { RoleIdentity } from '../types/game'; 

export const ROLES: RoleIdentity[] = [
    {
      id: 'detective',
      name: 'Detective',
      team: 'CIVILIAN',
      powerlevel: 3,
      abilityName: 'Warrant',
      abilityDescription: 'Action: Force an opponent to show you all Evidence cards in their hand. Then, you may choose 1 to play immediatley.'
    },
    {
      id: 'robber',
      name: 'Robber',
      team: 'CRIMINAL',
      powerlevel: 2,
      abilityName: 'Pickpocket',
      abilityDescription: 'Steal $1 from a Civilian with $3 or more OR steal 1 card from a Civilian with 3 cards or more.'
    }
    // Add more roles here...
  ];