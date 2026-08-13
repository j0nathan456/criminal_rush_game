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
 * A player's role card (rulebook §4): identity + team + base power level, the
 * role ability, and the live trackers for Power Level, Money, and remaining
 * actions. Active players show which action cubes are still available.
 */
export function RoleCard({ player, active }: RoleCardProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const art = roleArtUrl(player.role.id);

  return (
    <section
      className={`cr-role${active ? ' is-active' : ''}${art ? ' cr-role--art' : ''}`}
      style={{ '--team-color': meta.color, '--team-soft': meta.soft } as React.CSSProperties}
      aria-label={`${player.name}'s role card`}
    >
      <header className="cr-role__head">
        <div>
          <div className="cr-role__name">{player.role.name}</div>
          <div className="cr-role__team">
            {meta.label} · Base PL {player.role.powerlevel}
          </div>
        </div>
        <div className="cr-role__player">
          {player.name}
          {active && <span className="cr-role__turn">Your turn</span>}
        </div>
      </header>

      {art ? (
        <img className="cr-role__art" src={art} alt={`${player.role.name} role mat`} loading="lazy" />
      ) : (
        <div className="cr-role__ability">
          <span className="cr-role__ability-name">{player.role.abilityName}</span>
          <p>{player.role.abilityDescription}</p>
        </div>
      )}

      <div className="cr-trackers">
        <div className="cr-tracker">
          <span className="cr-tracker__label">Power</span>
          <span className="cr-tracker__value">{player.powerLevel} PL</span>
        </div>
        <div className="cr-tracker">
          <span className="cr-tracker__label">Money</span>
          <span className="cr-tracker__value">${player.money}</span>
        </div>
        <div className="cr-tracker">
          <span className="cr-tracker__label">Actions</span>
          <span className="cr-tracker__cubes">
            {Array.from({ length: BASE_ACTIONS_PER_TURN }, (_, i) => (
              <span key={i} className={`cr-cube${i < player.actionsRemaining ? ' is-on' : ''}`} />
            ))}
          </span>
        </div>
      </div>

      {statuses.length > 0 && (
        <div className="cr-role__status">
          {statuses.map((key) => (
            <span key={key} className="cr-status" style={{ background: STATUS_META[key].color }}>
              {STATUS_META[key].icon} {STATUS_META[key].label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
