import type { Team } from '../types/cards';

/** Vite serves `public/` at the app base; BASE_URL always ends in a slash. */
const BASE = import.meta.env.BASE_URL ?? '/';

/** Snipped character portraits standing in for each team (see public/team). */
const TEAM_ICON_SRC: Record<Team, string> = {
  CIVILIAN: `${BASE}team/civilian.png`,
  CRIMINAL: `${BASE}team/criminal.png`,
};

/** A small rounded portrait used as each team's icon in place of an emoji. */
export function TeamIcon({ team, className }: { team: Team; className?: string }) {
  return (
    <img
      src={TEAM_ICON_SRC[team]}
      alt=""
      aria-hidden="true"
      className={className ?? 'inline-block h-5 w-5 shrink-0 rounded-full object-cover align-[-0.3em]'}
    />
  );
}
