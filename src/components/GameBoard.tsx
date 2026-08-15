import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, Player, CombatSide } from '../types/game';
import type { EvidenceCategory, AnyCard, MarketCard } from '../types/cards';
import type { ActionMeta } from '../constants/theme';
import type { RoleAbilityPayload, PerkPayload, EventOptions } from '../engine';
import type { CombatChoiceInput } from '../types/game';
import { actionsForTurn, actionAvailability } from '../engine';
import { TEAM_META } from '../constants/theme';

import { ScoreBoard } from './ScoreBoard';
import { RoleCard } from './RoleCard';
import { PlayerHand } from './PlayerHand';
import { ActionBar } from './ActionBar';
import { GameLog } from './GameLog';
import { PlayerSeat } from './PlayerSeat';
import { TableLayout } from './TableLayout';
import { SharedZones } from './SharedZones';
import { CombatPanel } from './CombatPanel';
import { RoleAbilityPanel } from './RoleAbilityPanel';
import { PerkActionPanel } from './PerkActionPanel';
import { AllySupportPanel } from './AllySupportPanel';
import { ACTIONABLE_PERKS } from './panelConstants';

/** Which target the board is currently asking the player to pick. */
export type TargetMode = 'attack' | 'expose' | null;

export interface GameBoardHandlers {
  onAction?: (action: ActionMeta) => void;
  onEndTurn?: () => void;
  onSelectCard?: (card: AnyCard) => void;
  onPlayEvidence?: (category: EvidenceCategory) => void;
  onPlaySelected?: () => void;
  onBuy?: (card: AnyCard) => void;
  onSell?: (card: MarketCard) => void;
  onSelectTarget?: (playerId: string) => void;
  onCancelTargeting?: () => void;
  onPlayPower?: (cardId: string, side: CombatSide, byPlayerId: string) => void;
  onPassCombat?: (side: CombatSide) => void;
  onDiscardMoney?: (side: CombatSide, cardIds: string[]) => void;
  onCombatChoice?: (input: CombatChoiceInput) => void;
  onSubmitRoleAbility?: (payload: RoleAbilityPayload) => void;
  onCancelRoleAbility?: () => void;
  onUsePerk?: (perkId: string) => void;
  onSubmitPerk?: (perkId: string, payload: PerkPayload) => void;
  onCancelPerk?: () => void;
  onClearTraffic?: () => void;
  onSubmitAllySupport?: (teammateId: string, options: EventOptions) => void;
  onCancelAllySupport?: () => void;
}

interface GameBoardProps extends GameBoardHandlers {
  state: GameState;
  /** Index of the local player (whose hand/role card is shown in detail). */
  viewerIndex?: number;
  selectedCardId?: string | null;
  targeting?: TargetMode;
  /** Transient status/hint line shown above the board. */
  notice?: string | null;
  /** Whether the role-ability panel is open for the viewer. */
  roleAbilityOpen?: boolean;
  /** The perk whose action panel is open, or null. */
  activePerkId?: string | null;
  /** The Ally Support event card being played, or null. */
  allySupportCardId?: string | null;
}

/**
 * Top-level board layout — a pure view of GameState + callbacks. Noir dossier
 * styling; the `setup` layer (via GameController/PlayableBoard) wires the
 * engine reducer to these handlers.
 */
export function GameBoard({
  state,
  viewerIndex = state.currentPlayerIndex,
  selectedCardId,
  targeting = null,
  notice,
  roleAbilityOpen = false,
  activePerkId = null,
  allySupportCardId = null,
  onAction,
  onEndTurn,
  onSelectCard,
  onPlayEvidence,
  onPlaySelected,
  onBuy,
  onSell,
  onSelectTarget,
  onCancelTargeting,
  onPlayPower,
  onPassCombat,
  onDiscardMoney,
  onCombatChoice,
  onSubmitRoleAbility,
  onCancelRoleAbility,
  onUsePerk,
  onSubmitPerk,
  onCancelPerk,
  onClearTraffic,
  onSubmitAllySupport,
  onCancelAllySupport,
}: GameBoardProps) {
  const viewer = state.players[viewerIndex];
  const isViewersTurn = viewerIndex === state.currentPlayerIndex;
  const current = state.players[state.currentPlayerIndex];

  const isTargetable = (p: Player): boolean => {
    if (!targeting || !viewer || p.id === viewer.id) return false;
    if (targeting === 'expose') return p.team === 'CRIMINAL' && !p.isCaptured && !p.isExposed;
    return p.team !== viewer.team;
  };

  const selectedCard = viewer?.hand.find((c) => c.id === selectedCardId);
  const canPlaySelected = Boolean(selectedCard) && selectedCard?.type !== 'EVIDENCE' && selectedCard?.type !== 'POWER';

  const maxActions = viewer ? actionsForTurn(viewer) : 0;
  const availability = viewer ? actionAvailability(state, viewerIndex) : {};

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-line/80 bg-gradient-to-r from-civ/10 via-transparent to-crim/10 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tracking-wide">Criminal Rush</span>
          <span className="hidden text-sm text-fog sm:inline">Save the City… or Control It</span>
        </div>
        {current && (
          <div className="text-sm text-fog">
            Current turn:{' '}
            <strong style={{ color: TEAM_META[current.team].color }}>{current.name}</strong>
          </div>
        )}
      </header>

      {state.winner && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl px-5 py-4 text-center text-xl font-extrabold"
          style={{ background: TEAM_META[state.winner].soft, color: TEAM_META[state.winner].color }}
        >
          🏆 {TEAM_META[state.winner].label} win the game!
        </motion.div>
      )}

      <AnimatePresence>
        {(notice || targeting) && !state.winner && !state.combat && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5 text-amber"
          >
            <span>{targeting ? `Select a target to ${targeting}.` : notice}</span>
            {targeting && (
              <button type="button" className="btn btn-ghost border-amber/60 px-3 py-1 text-amber" onClick={onCancelTargeting}>
                Cancel
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {state.combat && !state.winner && (
        <CombatPanel
          state={state}
          onPlayPower={onPlayPower}
          onPassCombat={onPassCombat}
          onDiscardMoney={onDiscardMoney}
          onCombatChoice={onCombatChoice}
        />
      )}

      {roleAbilityOpen && !state.combat && !state.winner && (
        <RoleAbilityPanel state={state} viewerIndex={viewerIndex} onSubmit={onSubmitRoleAbility} onCancel={onCancelRoleAbility} />
      )}
      {activePerkId && !state.combat && !state.winner && (
        <PerkActionPanel state={state} viewerIndex={viewerIndex} perkId={activePerkId} onSubmit={onSubmitPerk} onCancel={onCancelPerk} />
      )}
      {allySupportCardId && !state.combat && !state.winner && (
        <AllySupportPanel state={state} viewerIndex={viewerIndex} onSubmit={onSubmitAllySupport} onCancel={onCancelAllySupport} />
      )}

      {/* Spatial table layout (wide screens) */}
      <div className="hidden lg:block">
        <TableLayout
          state={state}
          viewerIndex={viewerIndex}
          viewer={viewer}
          isViewersTurn={isViewersTurn}
          targeting={Boolean(targeting)}
          isTargetable={isTargetable}
          onSelectTarget={onSelectTarget}
          onPlayEvidence={onPlayEvidence}
          onBuy={onBuy}
        />
      </div>

      {/* Stacked fallback (narrow screens) */}
      <div className="flex flex-col gap-4 lg:hidden">
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
        <section className="panel" aria-label="Players">
          <header className="panel-head"><h2 className="panel-title">Players</h2></header>
          <div className="flex flex-col gap-2">
            {state.players.map((p, i) => (
              <PlayerSeat
                key={p.id}
                player={p}
                active={i === state.currentPlayerIndex}
                isSelf={i === viewerIndex}
                targetable={isTargetable(p)}
                onClick={targeting ? (pl) => onSelectTarget?.(pl.id) : undefined}
              />
            ))}
          </div>
        </section>
        <SharedZones
          state={state}
          viewer={viewer}
          isViewersTurn={isViewersTurn}
          onPlayEvidence={onPlayEvidence}
          onBuy={onBuy}
        />
        <GameLog entries={state.gameLog} />
      </div>

      {viewer && (
        <footer className="flex flex-wrap items-stretch gap-4">
          <RoleCard player={viewer} active={isViewersTurn} maxActions={maxActions} />

          <div className="flex flex-[2] basis-[380px] flex-col gap-3">
            <PlayerHand cards={viewer.hand} selectedId={selectedCardId} onSelect={onSelectCard} />
            {canPlaySelected && (
              <button
                type="button"
                className="btn self-start border-transparent text-ink"
                style={{ background: 'linear-gradient(90deg,#10b981,#3fd0c9)' }}
                onClick={onPlaySelected}
              >
                Play {selectedCard!.name}
              </button>
            )}
            {viewer.inventory.length > 0 && (
              <section className="panel" aria-label="Your items">
                <header className="panel-head"><h2 className="panel-title">Items</h2></header>
                <div className="flex flex-col gap-1.5">
                  {viewer.inventory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-panel-2/70 px-3 py-1.5 text-sm"
                    >
                      <span>{item.name}</span>
                      <span className="flex gap-1.5">
                        {isViewersTurn && onUsePerk && ACTIONABLE_PERKS.has(item.name) && (
                          <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onUsePerk(item.id)}>
                            Use
                          </button>
                        )}
                        {onSell && item.type !== 'SPECIAL' && item.name !== 'Investment' && (
                          <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onSell(item)}>
                            Sell $1
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {isViewersTurn && viewer.trafficToken && onClearTraffic && (
              <button type="button" className="btn self-start" onClick={onClearTraffic}>
                Clear Traffic token ($1)
              </button>
            )}
          </div>

          <ActionBar
            player={viewer}
            maxActions={maxActions}
            availability={availability}
            onAction={isViewersTurn ? onAction : undefined}
            onEndTurn={isViewersTurn ? onEndTurn : undefined}
          />
        </footer>
      )}
    </div>
  );
}
