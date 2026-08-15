import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, Player, CombatSide } from '../types/game';
import type { EvidenceCategory, AnyCard, MarketCard } from '../types/cards';
import type { ActionMeta } from '../constants/theme';
import type { RoleAbilityPayload, PerkPayload, EventOptions } from '../engine';
import type { CombatChoiceInput } from '../types/game';
import { actionsForTurn, actionAvailability, handCardPlayable } from '../engine';
import { TEAM_META } from '../constants/theme';

import { ScoreBoard } from './ScoreBoard';
import { RoleCard } from './RoleCard';
import { PlayerHand } from './PlayerHand';
import { ActionBar } from './ActionBar';
import { GameLog } from './GameLog';
import { Roster } from './Roster';
import { EvidenceGrid } from './EvidenceGrid';
import { Piles } from './Piles';
import { Markets } from './Markets';
import { TeamIcon } from './TeamIcon';
import { TurnPhases } from './TurnPhases';
import { CombatPanel } from './CombatPanel';
import { RoleAbilityPanel } from './RoleAbilityPanel';
import { PerkActionPanel } from './PerkActionPanel';
import { AllySupportPanel } from './AllySupportPanel';

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
    <div className="flex min-h-screen flex-col gap-2 p-3">
      {/* Top bar (compact) */}
      <header className="flex items-center justify-between gap-3 rounded-xl border border-line/80 bg-gradient-to-r from-civ/10 via-transparent to-crim/10 px-4 py-1.5 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-extrabold tracking-wide">Criminal Rush</span>
          <span className="hidden text-xs text-fog sm:inline">Save the City… or Control It</span>
        </div>
      </header>

      {/* Prominent active-player indicator — the most conspicuous global state. */}
      {current && !state.winner && (
        <div
          aria-label="Active player"
          className="flex items-center gap-3 rounded-2xl border-2 px-5 py-3 animate-turn-pulse"
          style={{ borderColor: TEAM_META[current.team].color, background: TEAM_META[current.team].soft }}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: TEAM_META[current.team].color, boxShadow: `0 0 10px ${TEAM_META[current.team].color}` }}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xl font-extrabold" style={{ color: TEAM_META[current.team].color }}>
              {isViewersTurn ? 'Your turn' : `${current.name}'s turn`}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-fog">
              <TeamIcon team={current.team} className="h-5 w-5 shrink-0 rounded-full object-cover" />
              {current.name} · {current.role.name} · {TEAM_META[current.team].label}
            </span>
          </div>
        </div>
      )}

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

      {/* Board grid — columns 1:3:1, three rows:
          row 1  Score Board · Evidence Grid · Case Log
          row 2  Players     · Markets       · Deck/Discard
          row 3  Profile     · Hand          · Actions        */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)]">
        {/* Row 1 */}
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
        <main className="min-w-0">
          <EvidenceGrid
            grid={state.evidenceGrid}
            onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
          />
        </main>
        <GameLog entries={state.gameLog} />

        {/* Row 2 */}
        <Roster
          players={state.players}
          currentPlayerIndex={state.currentPlayerIndex}
          viewerIndex={viewerIndex}
          targeting={Boolean(targeting)}
          isTargetable={isTargetable}
          onSelectTarget={onSelectTarget}
          defaultOpen
        />
        <div className="min-w-0">
          <Markets state={state} viewer={viewer} isViewersTurn={isViewersTurn} onBuy={onBuy} />
        </div>
        <Piles drawPile={state.drawPile} discardPile={state.discardPile} />

        {/* Row 3 */}
        {viewer && (
          <>
            <RoleCard
              player={viewer}
              active={isViewersTurn}
              maxActions={maxActions}
              canManageItems={isViewersTurn}
              onUsePerk={onUsePerk}
              onSell={onSell}
            />

            <div className="flex min-w-0 flex-col gap-3">
              <PlayerHand
                cards={viewer.hand}
                selectedId={selectedCardId}
                availabilityOf={(card) => handCardPlayable(state, viewerIndex, card)}
                onSelect={onSelectCard}
              />
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
              {isViewersTurn && viewer.trafficToken && onClearTraffic && (
                <button type="button" className="btn self-start" onClick={onClearTraffic}>
                  Clear Traffic token ($1)
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <TurnPhases
                actionsRemaining={viewer.actionsRemaining}
                maxActions={maxActions}
                accent={TEAM_META[viewer.team].color}
              />
              <ActionBar
                player={viewer}
                maxActions={maxActions}
                availability={availability}
                onAction={isViewersTurn ? onAction : undefined}
                onEndTurn={isViewersTurn ? onEndTurn : undefined}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
