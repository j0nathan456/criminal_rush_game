import { useState } from 'react';
import type { GameState, Player } from '../types/game';
import type { EventOptions } from '../engine';
import { TEAM_META } from '../constants/theme';
import { RoleAbilityPanel } from './RoleAbilityPanel';
import { PerkActionPanel } from './PerkActionPanel';
import { PASSIVE_ROLES, ACTIONABLE_PERKS } from './panelConstants';

export interface AllySupportPanelProps {
  state: GameState;
  viewerIndex: number;
  /** Submit the Ally Support play: the teammate to copy and the copied-action options. */
  onSubmit?: (teammateId: string, options: EventOptions) => void;
  onCancel?: () => void;
}

/** A teammate whose role Action or perk Action can be copied. */
function copyableActions(player: Player): { hasRole: boolean; perks: Player['inventory'] } {
  const hasRole = !PASSIVE_ROLES.has(player.role.id);
  const perks = player.inventory.filter((c) => ACTIONABLE_PERKS.has(c.name));
  return { hasRole, perks };
}

/**
 * Drives the Ally Support event: pick a teammate, then copy their role Action
 * (rendered via RoleAbilityPanel with a role override) or one of their perk
 * Actions (via PerkActionPanel with a perk override). The actor performs the
 * copied action with their own resources; the engine runs it "for free".
 */
export function AllySupportPanel({ state, viewerIndex, onSubmit, onCancel }: AllySupportPanelProps) {
  const viewer = state.players[viewerIndex];
  const [teammateId, setTeammateId] = useState<string>();
  const [copy, setCopy] = useState<{ kind: 'ROLE' } | { kind: 'PERK'; perkId: string }>();

  if (!viewer) return null;

  const teammates = state.players.filter(
    (p) => p.team === viewer.team && p.id !== viewer.id && !p.isInjured && !p.isCaptured,
  );
  const teammate = teammateId ? state.players.find((p) => p.id === teammateId) : undefined;

  // Step 3a: copy the teammate's role Action.
  if (teammate && copy?.kind === 'ROLE') {
    return (
      <RoleAbilityPanel
        state={state}
        viewerIndex={viewerIndex}
        roleIdOverride={teammate.role.id}
        title={`Ally Support — ${teammate.role.name}’s ${teammate.role.abilityName}`}
        subtitle={teammate.role.abilityDescription}
        submitLabel="Copy this Action"
        onSubmit={(payload) => onSubmit?.(teammate.id, { allyPayload: payload })}
        onCancel={() => setCopy(undefined)}
      />
    );
  }

  // Step 3b: copy one of the teammate's perk Actions.
  if (teammate && copy?.kind === 'PERK') {
    const perk = teammate.inventory.find((c) => c.id === copy.perkId);
    if (perk) {
      return (
        <PerkActionPanel
          state={state}
          viewerIndex={viewerIndex}
          perkId={perk.id}
          perkOverride={perk}
          submitLabel={`Copy ${perk.name}`}
          onSubmit={(perkId, payload) => onSubmit?.(teammate.id, { allyPerkId: perkId, allyPayload: payload })}
          onCancel={() => setCopy(undefined)}
        />
      );
    }
  }

  const chip = (label: string, selected: boolean, onClick: () => void, key: string) => (
    <button key={key} type="button" className={`cr-role__chip${selected ? ' is-selected' : ''}`} onClick={onClick}>
      {label}
    </button>
  );

  const actions = teammate ? copyableActions(teammate) : undefined;

  return (
    <section className="cr-role" aria-label="Ally Support">
      <header className="cr-role__head" style={{ color: TEAM_META[viewer.team].color }}>
        <h2>🤝 Ally Support</h2>
      </header>
      <p className="cr-role__desc">Copy a teammate’s role or perk Action.</p>

      <div className="cr-role__body">
        <p>Choose a teammate:</p>
        <div className="cr-role__chips">
          {teammates.length === 0 && <span className="cr-role__empty">No eligible teammates.</span>}
          {teammates.map((p) => chip(p.name, teammateId === p.id, () => { setTeammateId(p.id); setCopy(undefined); }, p.id))}
        </div>

        {teammate && actions && (
          <>
            <p className="cr-role__sub">Copy which Action?</p>
            <div className="cr-role__chips">
              {actions.hasRole && chip(`${teammate.role.abilityName} (role)`, false, () => setCopy({ kind: 'ROLE' }), 'role')}
              {actions.perks.map((perk) => chip(perk.name, false, () => setCopy({ kind: 'PERK', perkId: perk.id }), perk.id))}
              {!actions.hasRole && actions.perks.length === 0 && (
                <span className="cr-role__empty">{teammate.name} has no copyable Action.</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="cr-role__actions">
        <button type="button" className="cr-role__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
