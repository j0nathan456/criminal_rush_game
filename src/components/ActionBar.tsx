import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PlayerActionType } from '../types/game';
import type { ActionAvailability } from '../engine';
import { TURN_ACTIONS, TEAM_META, BASE_ACTIONS_PER_TURN } from '../constants/theme';
import type { ActionMeta } from '../constants/theme';
import { PASSIVE_ROLES } from './panelConstants';
import { backdrop, panelIn } from '../ui/motion';

interface ActionBarProps {
  player: Player;
  /** Actions granted this turn (role/perk-adjusted); drives the AP tracker. */
  maxActions?: number;
  /** Per-action legality from the engine; missing entries are treated as enabled. */
  availability?: Partial<Record<PlayerActionType, ActionAvailability>>;
  onAction?: (action: ActionMeta) => void;
  onEndTurn?: () => void;
}

/** A row of small pips, `filled` of `total` lit in the given color. */
function Pips({ total, filled, color }: { total: number; filled: number; color: string }) {
  return (
    <span className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full border"
          style={
            i < filled
              ? { background: color, borderColor: color }
              : { borderColor: 'var(--color-line)' }
          }
        />
      ))}
    </span>
  );
}

/**
 * The turn action bar (rulebook §3). Renders the team-appropriate choices from
 * TURN_ACTIONS, shows the player's remaining AP, marks each action's AP cost as
 * pips (so the 2-AP Combat reads as distinct), names the actual role ability,
 * and disables any action the player can't afford or that the engine reports as
 * currently illegal (with the reason surfaced as a tooltip). A passive role
 * (Mayor, Attorney, Vigilante, Hitman, Spy, Nurse — see PASSIVE_ROLES) has no
 * Action to spend a point on — its ability triggers automatically — so Role
 * Action is omitted entirely rather than shown as a live, costed option.
 */
export function ActionBar({ player, maxActions = BASE_ACTIONS_PER_TURN, availability = {}, onAction, onEndTurn }: ActionBarProps) {
  const [confirmEndTurn, setConfirmEndTurn] = useState(false);
  const actions = TURN_ACTIONS.filter(
    (a) => (!a.team || a.team === player.team) && (a.type !== 'ROLE_ABILITY' || !PASSIVE_ROLES.has(player.role.id)),
  );
  const teamColor = TEAM_META[player.team].color;

  // Ending with unspent actions is usually a misclick, not a real choice — ask
  // first rather than silently burning them. Nothing left to spend needs no
  // confirmation.
  const handleEndTurnClick = () => {
    if (player.actionsRemaining >= 1) {
      setConfirmEndTurn(true);
    } else {
      onEndTurn?.();
    }
  };

  return (
    <>
    <section
      className="panel flex flex-col gap-3 border-l-4"
      style={{
        borderLeftColor: teamColor,
        background: `linear-gradient(180deg, ${TEAM_META[player.team].soft}, transparent 140px)`,
      }}
      aria-label="Turn actions"
    >
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Actions</h2>
        <div className="flex items-center gap-2" title="Action points remaining this turn">
          <Pips total={Math.max(maxActions, player.actionsRemaining)} filled={player.actionsRemaining} color={teamColor} />
          <span className="text-sm font-bold tabular-nums text-chalk">
            {player.actionsRemaining}
            <span className="text-fog"> / {maxActions} AP</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const legal = availability[action.type] ?? { enabled: true };
          // Perk Action's real AP cost is per-perk (Water Bottle is free, the
          // rest cost 1) — the engine enforces it; don't gate the button on a
          // single flat cost or Water Bottle would be unreachable at 0 AP,
          // exactly when it's most useful.
          const tooExpensive = action.type !== 'PERK_ACTION' && action.cost > player.actionsRemaining;
          const disabled = tooExpensive || !legal.enabled || !onAction;
          const expensive = action.cost > 1;

          // ROLE_ABILITY names the player's actual ability instead of a generic label.
          const isRole = action.type === 'ROLE_ABILITY';
          const label = isRole ? player.role.abilityName || action.label : action.label;
          const description = isRole ? player.role.abilityDescription : undefined;

          // Weakened Network (rulebook p.16): a captured Criminal pays $1 more
          // for Expand Network — worth calling out on the button itself, not
          // just in the hover tooltip, since it only applies once captured.
          const isExpandNetwork = action.type === 'SPECIAL_GOAL' && action.team === 'CRIMINAL';
          // Traffic Jam: a Traffic token snarls its holder's own trades by +1
          // action, whichever side of the trade they end up on. Only the
          // player's own token is knowable before a teammate is even chosen,
          // so a token on the *other* party shows up in the Trade panel itself
          // once that teammate is picked, not here.
          const isTrade = action.type === 'TRADE';
          const surchargeNote =
            isExpandNetwork && player.isCaptured ? '+$1 more — captured (Weakened Network)'
            : isTrade && player.trafficToken ? '+1 AP more — Traffic token'
            : undefined;

          const baseTitle = !legal.enabled && legal.reason
            ? `${label} — ${legal.reason}`
            : description
              ? `${label} — ${description}`
              : action.hint;
          const title = surchargeNote ? `${baseTitle} (${surchargeNote})` : baseTitle;

          return (
            <button
              key={`${action.type}-${action.label}`}
              type="button"
              disabled={disabled}
              title={title}
              onClick={onAction ? () => onAction(action) : undefined}
              style={expensive ? { borderColor: 'var(--color-amber)' } : undefined}
              className={`flex flex-col items-start gap-0.5 rounded-lg border bg-panel-2 px-3 py-2 text-left
                         transition-all duration-150 enabled:hover:-translate-y-px enabled:hover:border-amber/60
                         disabled:cursor-not-allowed disabled:opacity-40
                         ${expensive ? 'border-l-[3px]' : 'border-line'}`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{action.icon}</span>
              <span className="text-[13px] font-bold text-chalk">{label}</span>
              {description ? (
                <span className="line-clamp-2 text-[11px] leading-snug text-fog">{description}</span>
              ) : null}
              {surchargeNote ? (
                <span className="text-[11px] font-bold text-amber">{surchargeNote}</span>
              ) : null}
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fog">
                <Pips total={action.cost} filled={action.cost} color={expensive ? 'var(--color-amber)' : teamColor} />
                {action.cost} AP
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={handleEndTurnClick} disabled={!onEndTurn}>
        End Turn ⏭
      </button>
    </section>

    {/* Portaled to <body>: this section (and most panels) sit under a
        backdrop-blur ancestor, which — like `filter` — creates a new
        containing block for `position: fixed`, so an in-place overlay would
        be clipped to this panel instead of covering the viewport. */}
    {createPortal(
      <AnimatePresence>
        {confirmEndTurn && (
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5 backdrop-blur-sm"
            role="dialog"
            aria-label="Confirm end turn"
          >
            <motion.div variants={panelIn} className="panel w-full max-w-sm border-2 p-6 text-center" style={{ borderColor: teamColor }}>
              <h2 className="text-xl font-extrabold text-chalk">End your turn?</h2>
              <p className="mt-2 text-fog">
                You still have {player.actionsRemaining} action{player.actionsRemaining === 1 ? '' : 's'} left.
              </p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary flex-1 py-3"
                  onClick={() => {
                    setConfirmEndTurn(false);
                    onEndTurn?.();
                  }}
                >
                  End Turn
                </button>
                <button type="button" className="btn flex-1 py-3" onClick={() => setConfirmEndTurn(false)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )}
    </>
  );
}
