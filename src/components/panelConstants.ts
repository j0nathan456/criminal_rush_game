/**
 * src/components/panelConstants.ts
 *
 * Small shared constants for the action panels. Kept in a non-component module
 * so the panel files export only components (react-refresh friendly).
 */

/**
 * Roles whose ability is passive (no per-turn Action to trigger or copy).
 * Nurse's Triage is reactive rather than passive — it's a genuine choice —
 * but it's offered as a NURSE_HEAL combat choice, not through this panel.
 */
export const PASSIVE_ROLES = new Set(['mayor', 'attorney', 'vigilante', 'hitman', 'spy', 'nurse']);

/** Perks with an engine-backed "Action:" (see reducer.applyPerk). */
export const ACTIONABLE_PERKS = new Set([
  'Water Bottle', 'Bank', 'Credit Card', 'Recycling Bin', 'Hacked Passwords', 'Alarm Clock', 'Coffee Machine',
  'Trash Can', 'Manipulate', 'Shady Press',
]);

/**
 * Event cards that need a target/option gathered before they can be played
 * (see EventPanel and resolveEvent) — everything else (Receive Package,
 * Generational Wealth, Lottery…) needs no input and dispatches immediately.
 * Ally Support has its own dedicated flow (AllySupportPanel), not this panel.
 */
export const CONFIGURABLE_EVENTS = new Set([
  'Market Access', 'Tax Collection', 'Gain Influence', 'Business Opportunity',
  'Market Exchange', 'Spring Cleaning', 'Traffic Jam',
]);
