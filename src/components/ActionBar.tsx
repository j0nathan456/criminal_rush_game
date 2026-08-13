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
 * The turn action bar (rulebook §3). Renders the 8 choices from the
 * TURN_ACTIONS constant, filtered to the player's team, and disables any the
 * player cannot currently afford or has already used this turn.
 */
export function ActionBar({ player, onAction, onEndTurn, usedThisTurn = [] }: ActionBarProps) {
  const actions = TURN_ACTIONS.filter((a) => !a.team || a.team === player.team);

  return (
    <section className="cr-actions" aria-label="Turn actions">
      <div className="cr-actions__list">
        {actions.map((action) => {
          const tooExpensive = action.cost > player.actionsRemaining;
          const alreadyUsed = Boolean(action.oncePerTurn) && usedThisTurn.includes(action.type);
          const disabled = tooExpensive || alreadyUsed || !onAction;
          return (
            <button
              key={`${action.type}-${action.label}`}
              type="button"
              className="cr-action"
              disabled={disabled}
              title={alreadyUsed ? `${action.hint} (already used)` : action.hint}
              onClick={onAction ? () => onAction(action) : undefined}
            >
              <span className="cr-action__icon" aria-hidden="true">{action.icon}</span>
              <span className="cr-action__label">{action.label}</span>
              <span className="cr-action__cost">{action.cost} AP</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="cr-endturn" onClick={onEndTurn} disabled={!onEndTurn}>
        End Turn ⏭
      </button>
    </section>
  );
}
