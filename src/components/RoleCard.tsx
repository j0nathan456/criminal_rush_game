import type { Player } from '../types/game';
import type { MarketCard } from '../types/cards';
import {
  TEAM_META,
  STATUS_META,
  MARKET_TYPE_META,
  BASE_ACTIONS_PER_TURN,
  MAX_PERKS,
  MAX_WEAPONS,
} from '../constants/theme';
import { roleArtUrl } from '../constants/cardArt';
import { playerTokens } from './playerTokens';
import { TeamIcon } from './TeamIcon';
import { ACTIONABLE_PERKS } from './panelConstants';

interface RoleCardProps {
  player: Player;
  /** True when it is this player's turn (drives the action-cube tracker). */
  active?: boolean;
  /** Actions granted this turn (role-adjusted); how many cubes to draw. */
  maxActions?: number;
  /** True when the viewer may Use/Sell their items (their own turn). */
  canManageItems?: boolean;
  onUsePerk?: (perkId: string) => void;
  onSell?: (card: MarketCard) => void;
}

type StatusKey = keyof typeof STATUS_META;

/** An item is sellable unless it's a Special (e.g. Expand Network) or Investment. */
function isSellable(item: MarketCard): boolean {
  return item.type !== 'SPECIAL' && item.name !== 'Investment';
}

/**
 * A compact player dashboard (rulebook §4): identity, team, base/current PL,
 * money, action tracker, the role ability text, and the perk/weapon slots the
 * player owns (4 perks + 2 weapons). Replaces the full-bleed role-mat image so a
 * player sees everything they need at readable size in about half the space.
 */
export function RoleCard({
  player,
  active,
  maxActions = BASE_ACTIONS_PER_TURN,
  canManageItems,
  onUsePerk,
  onSell,
}: RoleCardProps) {
  const meta = TEAM_META[player.team];
  const statuses = (Object.keys(STATUS_META) as StatusKey[]).filter((k) => player[k]);
  const tokens = playerTokens(player);
  const art = roleArtUrl(player.role.id);

  const weapons = player.inventory.filter((c) => c.type === 'WEAPON');
  const perks = player.inventory.filter((c) => c.type !== 'WEAPON');

  const renderItem = (item: MarketCard) => {
    const typeMeta = MARKET_TYPE_META[item.type];
    return (
      <div
        key={item.id}
        title={item.description}
        style={{ borderColor: typeMeta.color }}
        className="flex items-center justify-between gap-2 rounded-lg border-l-[3px] bg-panel-2/70 px-2.5 py-1.5 text-[13px]"
      >
        <span className="truncate">
          <span aria-hidden="true">{typeMeta.icon}</span> {item.name}
        </span>
        <span className="flex shrink-0 gap-1.5">
          {canManageItems && onUsePerk && ACTIONABLE_PERKS.has(item.name) && (
            <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={() => onUsePerk(item.id)}>
              Use
            </button>
          )}
          {canManageItems && onSell && isSellable(item) && (
            <button type="button" className="btn px-2 py-0.5 text-[11px]" onClick={() => onSell(item)}>
              Sell $1
            </button>
          )}
        </span>
      </div>
    );
  };

  const renderSlots = (label: string, owned: MarketCard[], max: number, accent: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-fog">{label}</span>
        <span className="text-[11px] tabular-nums text-fog">
          {owned.length}/{max}
        </span>
      </div>
      {owned.map(renderItem)}
      {Array.from({ length: Math.max(0, max - owned.length) }, (_, i) => (
        <div
          key={`empty-${i}`}
          className="rounded-lg border border-dashed border-line/70 px-2.5 py-1.5 text-[13px] text-fog/40"
          style={{ borderColor: `${accent}44` }}
        >
          Empty slot
        </div>
      ))}
    </div>
  );

  return (
    <section
      aria-label={`${player.name}'s role card`}
      style={{ borderLeftColor: meta.color, background: `linear-gradient(180deg, ${meta.soft}, transparent 120px)` }}
      className={`panel flex min-w-[260px] flex-1 flex-col gap-3 border-l-4 ${active ? 'animate-turn-pulse' : ''}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-extrabold leading-tight" style={{ color: meta.color }}>
            {player.role.name}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-fog">
            <TeamIcon team={player.team} className="h-4 w-4 shrink-0 rounded-full object-cover" /> {meta.label} · Base PL {player.role.powerlevel}
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

      {/* The specific role's printed card image (ability text falls back for art-less roles). */}
      {art ? (
        <img
          src={art}
          alt={`${player.role.name} role card`}
          loading="lazy"
          className="w-full rounded-lg border border-line bg-white"
        />
      ) : (
        <div className="rounded-lg p-2.5" style={{ background: meta.soft }}>
          <span className="text-[13px] font-extrabold text-chalk">✨ {player.role.abilityName}</span>
          <p className="mt-1 text-[13px] leading-snug text-fog">{player.role.abilityDescription}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
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
            {Array.from({ length: Math.max(maxActions, player.actionsRemaining) }, (_, i) => (
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

      {/* Perk & weapon slots (rulebook cap: 4 perks + 2 weapons). */}
      <div className="grid grid-cols-2 gap-2.5">
        {renderSlots('Perks', perks, MAX_PERKS, MARKET_TYPE_META.PERK.color)}
        {renderSlots('Weapons', weapons, MAX_WEAPONS, MARKET_TYPE_META.WEAPON.color)}
      </div>

      {(statuses.length > 0 || tokens.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((key) => (
            <span key={key} className="chip text-white" style={{ background: STATUS_META[key].color }}>
              {STATUS_META[key].icon} {STATUS_META[key].label}
            </span>
          ))}
          {tokens.map((t) => (
            <span key={t.key} title={t.hint} className="chip text-white" style={{ background: t.color }}>
              {t.icon} {t.label}
              {t.count && t.count > 1 ? ` ×${t.count}` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
