import type { RoleIdentity } from '../types/game';

/**
 * The full role roster (rulebook p.17). Base power levels and abilities are
 * taken directly from the rule book. The engine deals these out so that
 * Civilians and Criminals alternate around the table.
 *
 * This is game reference data consumed by the engine (initGame). It is
 * intentionally free of UI concerns.
 */
export const ROLES: RoleIdentity[] = [
  // --- Civilians ---
  {
    id: 'mayor', name: 'Mayor', team: 'CIVILIAN', powerlevel: 2,
    abilityName: 'City Hall',
    abilityDescription: 'Has +1 action per turn.',
  },
  {
    id: 'attorney', name: 'Attorney', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Retainer',
    abilityDescription: 'Whenever a teammate plays an Evidence card into the grid, collect $1.',
  },
  {
    id: 'collector', name: 'Collector', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Commission',
    abilityDescription: 'Action: Buy a perk or weapon. Then, collect $1.',
  },
  {
    id: 'sheriff', name: 'Sheriff', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Subpoena',
    abilityDescription: 'Action: Force an opponent to show you all Evidence cards they have. Choose one to play immediately.',
  },
  {
    id: 'vigilante', name: 'Vigilante', team: 'CIVILIAN', powerlevel: 2,
    abilityName: 'Vengeance',
    abilityDescription: 'Each time a Criminal scores a VP, draw a card and gain +1 PL (max +3). Cannot be injured.',
  },
  {
    id: 'nurse', name: 'Nurse', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Triage',
    abilityDescription: 'Whenever a teammate is injured, you may discard 1 card to immediately heal them.',
  },
  {
    id: 'bodyguard', name: 'Bodyguard', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Protection',
    abilityDescription: 'Give a teammate the Bodyguard token. While defending they gain +2 PL and you may play Power cards for them.',
  },
  {
    id: 'witness', name: 'Witness', team: 'CIVILIAN', powerlevel: 3,
    abilityName: 'Testimony',
    abilityDescription: 'When a teammate is injured, take 1 discarded Evidence card into your hand OR play 1 Evidence card from your hand.',
  },

  // --- Criminals ---
  {
    id: 'crime-lord', name: 'Crime Lord', team: 'CRIMINAL', powerlevel: 4,
    abilityName: 'Connections',
    abilityDescription: 'Action: Purchase Expand Network for $1 less.',
  },
  {
    id: 'hitman', name: 'Hitman', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Marksman',
    abilityDescription: 'Each weapon you have has +1 PL when attacking.',
  },
  {
    id: 'spy', name: 'Spy', team: 'CRIMINAL', powerlevel: 4,
    abilityName: 'Recon',
    abilityDescription: 'At the beginning of your turn, look at the top 2 cards of the deck.',
  },
  {
    id: 'evil-scientist', name: 'Evil Scientist', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Experiment',
    abilityDescription: 'Action: Buy a Tech or Chemical weapon for a $1 discount and draw a card.',
  },
  {
    id: 'robber', name: 'Robber', team: 'CRIMINAL', powerlevel: 2,
    abilityName: 'Pickpocket',
    abilityDescription: 'Action: Steal $1 from a Civilian with $3+ OR steal 1 card from a Civilian with 3+ cards.',
  },
  {
    id: 'arsonist', name: 'Arsonist', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Threaten',
    abilityDescription: 'Action: Choose an opponent. They must discard 1 card or lose $1.',
  },
  {
    id: 'smuggler', name: 'Smuggler', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Contraband',
    abilityDescription: 'Action: Move a perk or weapon from the Market into the Black Market, purchasable for $1 cheaper.',
  },
  {
    id: 'forger', name: 'Forger', team: 'CRIMINAL', powerlevel: 3,
    abilityName: 'Fabricate',
    abilityDescription: 'Action: Discard 1 Evidence card to discard 1 Evidence card from the grid of the same category.',
  },
];

/** Convenience lookups. */
export const CIVILIAN_ROLES = ROLES.filter((r) => r.team === 'CIVILIAN');
export const CRIMINAL_ROLES = ROLES.filter((r) => r.team === 'CRIMINAL');
export const ROLE_BY_ID: Record<string, RoleIdentity> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
);
