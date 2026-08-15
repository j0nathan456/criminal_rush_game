/**
 * A small breadcrumb of the rulebook's turn structure (§3): resolve
 * start-of-turn triggers → take up to N actions → heal at end of turn. The
 * engine resolves Start and End atomically, so this is a display aid: it always
 * highlights the interactive "Actions" phase and explains, via tooltips, what
 * resolves before and after so new players know when things happen.
 */
interface TurnPhasesProps {
  /** Actions still available this turn (drives the "Actions" count). */
  actionsRemaining: number;
  /** Actions granted this turn (role/perk-adjusted). */
  maxActions: number;
  /** The viewer's team color, used for the active-phase accent. */
  accent: string;
}

const PHASES = [
  { key: 'start', label: 'Start', hint: 'Start of turn: resolve triggers — virus, income, draws, coffee, vitamin.' },
  { key: 'actions', label: 'Actions', hint: 'Take up to your action limit, in any order.' },
  { key: 'end', label: 'End', hint: 'End of turn: injured Civilians heal, then play passes to the next seat.' },
] as const;

export function TurnPhases({ actionsRemaining, maxActions, accent }: TurnPhasesProps) {
  return (
    <div className="flex items-center gap-1 text-[11px] font-semibold" aria-label="Turn phases">
      {PHASES.map((phase, i) => {
        const isActive = phase.key === 'actions';
        return (
          <div key={phase.key} className="flex items-center gap-1">
            <span
              title={phase.hint}
              className={`rounded-md px-2 py-1 ${isActive ? 'text-ink' : 'bg-panel-2 text-fog'}`}
              style={isActive ? { background: accent } : undefined}
            >
              {phase.label}
              {isActive ? ` · ${actionsRemaining}/${maxActions}` : ''}
            </span>
            {i < PHASES.length - 1 && <span className="text-fog/60" aria-hidden="true">▸</span>}
          </div>
        );
      })}
    </div>
  );
}
