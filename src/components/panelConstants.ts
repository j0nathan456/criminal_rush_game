/**
 * src/components/panelConstants.ts
 *
 * Small shared constants for the action panels. Kept in a non-component module
 * so the panel files export only components (react-refresh friendly).
 */

/** Roles whose ability is passive (no per-turn Action to trigger or copy). */
export const PASSIVE_ROLES = new Set(['mayor', 'attorney', 'vigilante', 'hitman', 'spy']);

/** Perks with an engine-backed "Action:" (see reducer.usePerk). */
export const ACTIONABLE_PERKS = new Set([
  'Water Bottle', 'Bank', 'Credit Card', 'Recycling Bin', 'Hacked Passwords', 'Alarm Clock', 'Coffee Machine',
]);
