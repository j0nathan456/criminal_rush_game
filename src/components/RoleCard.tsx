import type { Player } from '../types/game';
import { TEAM_META, STATUS_META, BASE_ACTIONS_PER_TURN } from '../constants/theme';
import { roleArtUrl } from '../constants/cardArt';

interface RoleCardProps {
  player: Player;
  /** True when it is this player's turn (drives the action-cube tracker). */
  active?: boolean;
}

type StatusKey = keyof typeof STATUS_META;

/**
 * A player's role card (rulebook §4): identity, team, base PL, the ability (or
 * printed role mat), and live Power / Money / Actions trackers.
 */
export function RoleCard({ player, active }: RoleCardProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const art = roleArtUrl(player.role.id);

  return (
    <section
      aria-label={`${player.name}'s role card`}
      style={{ borderLeftColor: meta.color }}
      className={`panel flex min-w-[260px] flex-1 flex-col border-l-4 ${active ? 'animate-turn-pulse' : ''}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold leading-tight" style={{ color: meta.color }}>
            {player.role.name}
          </div>
          <div className="text-[13px] text-fog">
            {meta.label} · Base PL {player.role.powerlevel}
          </div>
        </div>
        <div className="text-right text-sm font-bold">
          {player.name}
          {active && (
            <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
              Your turn
            </span>
          )}
        </div>
      </header>

      {art ? (
        <img
          src={art}
          alt={`${player.role.name} role mat`}
          loading="lazy"
          className="my-3 w-full rounded-lg bg-white"
        />
      ) : (
        <div className="my-3 rounded-lg p-2.5" style={{ background: meta.soft }}>
          <span className="text-[13px] font-extrabold text-chalk">{player.role.abilityName}</span>
          <p className="mt-1 text-[13px] text-fog">{player.role.abilityDescription}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2.5">
        <div className="flex flex-1 basis-[70px] flex-col gap-1 rounded-lg bg-panel-2 px-2.5 py-2">
          <span className="text-[11px] uppercase tracking-wide text-fog">Power</span>
          <span className="text-lg font-extrabold">{player.powerLevel} PL</span>
        </div>
        <div className="flex flex-1 basis-[70px] flex-col gap-1 rounded-lg bg-panel-2 px-2.5 py-2">
          <span className="text-[11px] uppercase tracking-wide text-fog">Money</span>
          <span className="text-lg font-extrabold">${player.money}</span>
        </div>
        <div className="flex flex-1 basis-[70px] flex-col gap-1 rounded-lg bg-panel-2 px-2.5 py-2">
          <span className="text-[11px] uppercase tracking-wide text-fog">Actions</span>
          <span className="flex gap-1.5">
            {Array.from({ length: BASE_ACTIONS_PER_TURN }, (_, i) => (
              <span
                key={i}
                className="h-4 w-4 rounded border-2"
                style={
                  i < player.actionsRemaining
                    ? { background: meta.color, borderColor: meta.color }
                    : { borderColor: 'var(--color-line)' }
                }
              />
            ))}
          </span>
        </div>
      </div>

      {statuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {statuses.map((key) => (
            <span key={key} className="chip text-white" style={{ background: STATUS_META[key].color }}>
              {STATUS_META[key].icon} {STATUS_META[key].label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
