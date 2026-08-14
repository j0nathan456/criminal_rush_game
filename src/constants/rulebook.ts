/**
 * src/constants/rulebook.ts
 *
 * A friendly, "dumbed-down" summary of the Criminal Rush rules for brand-new
 * players — enough to sit down and play without reading the full 18-page rule
 * book. Pure UI data: no logic, no imports. The HowToPlay component renders it.
 */

export interface RuleSection {
  icon: string;
  title: string;
  points: string[];
}

/** One-line hook shown at the top of the guide. */
export const RULEBOOK_TAGLINE = 'Detectives vs. a criminal syndicate — race to the most Victory Points.';

export const HOW_TO_PLAY: RuleSection[] = [
  {
    icon: '🎯',
    title: 'The Goal',
    points: [
      'Two hidden teams fight over Nocturne City: Civilians (detectives) vs. Criminals (the syndicate).',
      'The first team to reach the target number of Victory Points (VPs) — shown on the scoreboard — wins.',
      'If both teams reach the target together, the Civilians win.',
    ],
  },
  {
    icon: '🧑‍🤝‍🧑',
    title: 'The Two Teams',
    points: [
      'Civilians score a VP each time they EXPOSE or CAPTURE a Criminal.',
      'Criminals score a VP each time they win an ATTACK on a Civilian, or buy an Expand Network card.',
      'You keep your role card; your team is fixed for the whole game.',
    ],
  },
  {
    icon: '⏳',
    title: 'Your Turn (3 actions)',
    points: [
      'Spend your 3 actions in any order on the options below.',
      'Draw a card · Play a card · Buy a perk/weapon (once per turn) · Sell for $1.',
      'Use a role or perk action · Trade with a teammate.',
      'Expose (Civilians) or Expand Network (Criminals).',
      'Attack a neighbor — this one costs 2 actions.',
    ],
  },
  {
    icon: '🔎',
    title: 'Evidence (Civilians)',
    points: [
      'The Evidence Grid has 4 slots: Time, Means, Location, Motive.',
      'Play Evidence cards from your hand into matching empty slots.',
      'Some cards cover two categories — you choose which slot when you play it.',
      'Fill all four slots, then spend an action to Expose a Criminal and score a VP.',
      'Criminals can instead "burn" an Evidence card they draw to draw 2 new cards.',
    ],
  },
  {
    icon: '⚔️',
    title: 'Combat',
    points: [
      'Attacking costs 2 actions and normally only hits a neighbor. Civilians may only attack Exposed Criminals.',
      'Your Power Level = role base + weapons + perks. During the Power phase, both sides may play Power cards for more.',
      'Higher Power wins. The defender wins ties.',
      'Criminal wins → the Civilian is injured (no ability/attacks until healed next turn).',
      'Civilian wins → the Criminal is captured (out of combat, loses their ability).',
      'Lose an attack and nothing happens — but you still spent 2 actions.',
    ],
  },
  {
    icon: '💰',
    title: 'Money & the Market',
    points: [
      'Money cards give you cash to spend at the Market on perks (helpers) and weapons (combat power).',
      'You can hold at most 4 perks and 2 weapons.',
      'Criminals may also buy from the Black Market (including Expand Network).',
    ],
  },
  {
    icon: '🏆',
    title: 'Winning',
    points: [
      'Race to the VP target on the scoreboard for your player count.',
      'When the draw deck runs out, both teams score a VP.',
      'Civilians usually win by capturing the Criminals; Criminals rush attacks and Expand Network.',
    ],
  },
];
