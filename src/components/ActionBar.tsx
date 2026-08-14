import type { Player, PlayerActionType } from '../types/game';
import { TURN_ACTIONS } from '../constants/theme';
import type { ActionMeta } from '../constants/theme';

interface ActionBarProps {
  player: Player;
  onAction?: (action: ActionMeta) => void;
  onEndTurn?: () => void;
  /** Action types already used this turn (for once-per-turn limits). */
  usedThisTurn?: PlayerActionType[];
}

/**
 * The turn action bar (rulebook §3). Renders the team-appropriate choices from
 * TURN_ACTIONS and disables any the player can't afford or has already used.
 */
export function ActionBar({ player, onAction, onEndTurn, usedThisTurn = [] }: ActionBarProps) {
  const actions = TURN_ACTIONS.filter((a) => !a.team || a.team === player.team);

  return (
    <section className="panel flex flex-col gap-3" aria-label="Turn actions">
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const tooExpensive = action.cost > player.actionsRemaining;
          const alreadyUsed = Boolean(action.oncePerTurn) && usedThisTurn.includes(action.type);
          const disabled = tooExpensive || alreadyUsed || !onAction;
          return (
            <button
              key={`${action.type}-${action.label}`}
              type="button"
              disabled={disabled}
              title={alreadyUsed ? `${action.hint} (already used)` : action.hint}
              onClick={onAction ? () => onAction(action) : undefined}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-line bg-panel-2 px-3 py-2 text-left
                         transition-all duration-150 enabled:hover:-translate-y-px enabled:hover:border-amber/60
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-lg leading-none" aria-hidden="true">{action.icon}</span>
              <span className="text-[13px] font-bold text-chalk">{action.label}</span>
              <span className="text-[11px] text-fog">{action.cost} AP</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={onEndTurn} disabled={!onEndTurn}>
        End Turn ⏭
      </button>
    </section>
  );
}
