import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, Player, CombatSide } from '../types/game';
import type { EvidenceCategory, AnyCard, MarketCard } from '../types/cards';
import type { ActionMeta } from '../constants/theme';
import type { RoleAbilityPayload, PerkPayload, EventOptions, TradeItem } from '../engine';
import type { CombatChoiceInput } from '../types/game';
import { actionsForTurn, actionAvailability, handCardPlayable, neighborIds } from '../engine';
import { TEAM_META } from '../constants/theme';

import { ScoreBoard } from './ScoreBoard';
import { RoleCard } from './RoleCard';
import { PlayerHand } from './PlayerHand';
import { ActionBar } from './ActionBar';
import { GameLog } from './GameLog';
import { Roster } from './Roster';
import { EvidenceGrid } from './EvidenceGrid';
import { Piles } from './Piles';
import { SpyPeek } from './SpyPeek';
import { Markets } from './Markets';
import { TeamIcon } from './TeamIcon';
import { TurnPhases } from './TurnPhases';
import { CombatPanel } from './CombatPanel';
import { RoleAbilityPanel } from './RoleAbilityPanel';
import { PerkActionPanel } from './PerkActionPanel';
import { PerkPickerPanel } from './PerkPickerPanel';
import { AllySupportPanel } from './AllySupportPanel';
import { EventPanel } from './EventPanel';
import { MarketDiscountPanel } from './MarketDiscountPanel';
import { ThreatenPanel } from './ThreatenPanel';
import { BodyguardSetupPanel } from './BodyguardSetupPanel';
import { SheriffPanel } from './SheriffPanel';
import { ManipulatePanel } from './ManipulatePanel';
import { ExposeEvidencePanel } from './ExposeEvidencePanel';
import { EvidencePlayPanel } from './EvidencePlayPanel';
import { TradePanel } from './TradePanel';
import { ExpressShippingPanel } from './ExpressShippingPanel';
import { JournalPanel } from './JournalPanel';
import { EvidenceBurnPanel } from './EvidenceBurnPanel';
import { RecyclingBinPanel } from './RecyclingBinPanel';
import { MarketPickerPanel } from './MarketPickerPanel';
import { TargetPicker } from './TargetPicker';

/** Which target the board is currently asking the player to pick. */
export type TargetMode = 'attack' | 'expose' | null;

export interface GameBoardHandlers {
  onAction?: (action: ActionMeta) => void;
  onEndTurn?: () => void;
  onSelectCard?: (card: AnyCard) => void;
  onPlayEvidence?: (category: EvidenceCategory) => void;
  onCancelEvidencePlay?: () => void;
  onPlaySelected?: () => void;
  onBuy?: (card: AnyCard) => void;
  onSell?: (card: MarketCard) => void;
  onSelectTarget?: (playerId: string) => void;
  onCancelTargeting?: () => void;
  onPlayPower?: (cardId: string, side: CombatSide, byPlayerId: string, mirrorTargetCardId?: string) => void;
  onPassCombat?: (side: CombatSide) => void;
  onDiscardMoney?: (side: CombatSide, cardIds: string[]) => void;
  onCombatChoice?: (input: CombatChoiceInput) => void;
  onSubmitRoleAbility?: (payload: RoleAbilityPayload) => void;
  onCancelRoleAbility?: () => void;
  onSelectPerk?: (perkId: string) => void;
  onCancelPerkPicker?: () => void;
  onSubmitPerk?: (perkId: string, payload: PerkPayload) => void;
  onCancelPerk?: () => void;
  onClearTraffic?: () => void;
  onSubmitAllySupport?: (teammateId: string, options: EventOptions) => void;
  onCancelAllySupport?: () => void;
  onSubmitEvent?: (targetId: string | undefined, options: EventOptions) => void;
  onCancelEvent?: () => void;
  onUseMarketDiscount?: (cardId: string) => void;
  onSkipMarketDiscount?: () => void;
  onResolveThreaten?: (mode: 'MONEY' | 'DISCARD', cardId?: string) => void;
  onResolveBodyguardSetup?: (targetId: string) => void;
  onResolveSheriff?: (cardId: string, category?: EvidenceCategory) => void;
  onResolveManipulate?: (cardId: string) => void;
  onSubmitExpose?: (targetId: string, evidenceChoices: Partial<Record<EvidenceCategory, string>>) => void;
  onCancelExpose?: () => void;
  onInitiateTrade?: (targetId: string, give: TradeItem) => void;
  onResolveTradeReturn?: (give: TradeItem | null) => void;
  onCancelTrade?: () => void;
  onResolveExpressShipping?: (mode: 'MONEY' | 'DRAW') => void;
  onUseJournal?: (targetId: string | undefined, options: EventOptions) => void;
  onDeclineJournal?: () => void;
  onUseEvidenceBurn?: () => void;
  onDeclineEvidenceBurn?: () => void;
  onCancelBuy?: () => void;
  onResolveRecyclingBin?: (cardId: string | undefined, mode: 'MONEY' | 'DRAW' | undefined) => void;
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
  /** Whether the "which perk?" picker is open (2+ usable actionable perks). */
  perkPickerOpen?: boolean;
  /** The Ally Support event card being played, or null. */
  allySupportCardId?: string | null;
  /** The Event card (needing a target/option) being configured, or null. */
  eventCardId?: string | null;
  /** The Criminal being Exposed, once a grid category needs a card choice, or null. */
  exposeTargetId?: string | null;
  /** Whether the Trade panel is open for the viewer to initiate a trade. */
  tradeOpen?: boolean;
  /** Whether the Market/Black Market buy picker is open for the viewer. */
  buyOpen?: boolean;
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
  perkPickerOpen = false,
  allySupportCardId = null,
  eventCardId = null,
  exposeTargetId = null,
  tradeOpen = false,
  buyOpen = false,
  onAction,
  onEndTurn,
  onSelectCard,
  onPlayEvidence,
  onCancelEvidencePlay,
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
  onSelectPerk,
  onCancelPerkPicker,
  onSubmitPerk,
  onCancelPerk,
  onClearTraffic,
  onSubmitAllySupport,
  onCancelAllySupport,
  onSubmitEvent,
  onCancelEvent,
  onUseMarketDiscount,
  onSkipMarketDiscount,
  onResolveThreaten,
  onResolveBodyguardSetup,
  onResolveSheriff,
  onResolveManipulate,
  onSubmitExpose,
  onCancelExpose,
  onInitiateTrade,
  onResolveTradeReturn,
  onCancelTrade,
  onResolveExpressShipping,
  onUseJournal,
  onDeclineJournal,
  onUseEvidenceBurn,
  onDeclineEvidenceBurn,
  onCancelBuy,
  onResolveRecyclingBin,
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
  const canPlaySelected =
    Boolean(selectedCard) &&
    selectedCard?.type !== 'POWER' &&
    (selectedCard?.type !== 'EVIDENCE' || viewer?.team === 'CRIMINAL');

  const maxActions = viewer ? actionsForTurn(viewer) : 0;
  const availability = viewer ? actionAvailability(state, viewerIndex) : {};
  const viewerNeighborIds = viewer ? neighborIds(state, viewerIndex) : [];

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
        {notice && !targeting && !state.winner && !state.combat && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5 text-amber"
          >
            <span>{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {state.pendingBodyguardSetup && !state.combat && !state.winner && (
        <BodyguardSetupPanel state={state} viewerIndex={viewerIndex} onResolve={onResolveBodyguardSetup} />
      )}

      {state.pendingThreaten && !state.combat && !state.winner && (
        <ThreatenPanel state={state} viewerIndex={viewerIndex} onResolveThreaten={onResolveThreaten} />
      )}

      {state.pendingSheriff && !state.combat && !state.winner && (
        <SheriffPanel state={state} viewerIndex={viewerIndex} onResolve={onResolveSheriff} />
      )}

      {/* Board grid — columns 1:3:1, three rows:
          row 1  Score Board · Evidence Grid · Deck/Discard
          row 2  Players     · Markets       · Case Log
          row 3  Profile     · Hand          · Actions
          Case Log sits closer to the action row than the deck does — it's
          consulted far more often than the pile counts. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(800px,3fr)_minmax(350px,1.2fr)]">
        {/* Row 1 */}
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
        <main className="min-w-0">
          <EvidenceGrid
            grid={state.evidenceGrid}
            onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
          />
        </main>
        <Piles drawPile={state.drawPile} discardPile={state.discardPile} />

        {/* Row 2 */}
        <Roster
          players={state.players}
          currentPlayerIndex={state.currentPlayerIndex}
          viewerIndex={viewerIndex}
          targeting={Boolean(targeting)}
          isTargetable={isTargetable}
          onSelectTarget={onSelectTarget}
          neighborIds={viewerNeighborIds}
          defaultOpen
        />
        <div className="min-w-0">
          <Markets state={state} viewer={viewer} isViewersTurn={isViewersTurn} />
        </div>
        <GameLog entries={state.gameLog} />

        {/* Row 3 */}
        {viewer && (
          <>
            <RoleCard
              player={viewer}
              active={isViewersTurn}
              maxActions={maxActions}
              canManageItems={isViewersTurn}
              onSell={onSell}
            />

            <div className="flex min-w-0 flex-col gap-3">
              <PlayerHand
                cards={viewer.hand}
                selectedId={selectedCardId}
                availabilityOf={(card) => handCardPlayable(state, viewerIndex, card)}
                onSelect={onSelectCard}
              />
              {state.combat && !state.winner && (
                <CombatPanel
                  state={state}
                  viewerIndex={viewerIndex}
                  onPlayPower={onPlayPower}
                  onPassCombat={onPassCombat}
                  onDiscardMoney={onDiscardMoney}
                  onCombatChoice={onCombatChoice}
                />
              )}
              {state.lastPeek?.playerId === viewer.id && <SpyPeek card={state.lastPeek.cards[0]} />}
              {canPlaySelected && (
                <button
                  type="button"
                  className="btn self-start border-transparent text-ink"
                  style={{ background: 'linear-gradient(90deg,#10b981,#3fd0c9)' }}
                  onClick={onPlaySelected}
                >
                  {selectedCard!.type === 'EVIDENCE' && viewer.team === 'CRIMINAL' ? 'Burn' : 'Play'} {selectedCard!.name}
                </button>
              )}
              {isViewersTurn && viewer.trafficToken && onClearTraffic && (
                <button type="button" className="btn self-start" onClick={onClearTraffic}>
                  Clear Traffic token ($1)
                </button>
              )}
              {selectedCard && selectedCard.type === 'EVIDENCE' && viewer.team === 'CIVILIAN' && isViewersTurn &&
                !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                  <EvidencePlayPanel card={selectedCard} team={viewer.team} onPlay={onPlayEvidence} onCancel={onCancelEvidencePlay} />
              )}

              {/* Ability/perk/event/target "gather more input" panels render here,
                  right under the viewer's own hand, rather than up at the top of
                  the page — this is their own decision, so it belongs next to the
                  hand they're making it from. */}
              {targeting && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <TargetPicker state={state} viewerIndex={viewerIndex} mode={targeting} onSelectTarget={onSelectTarget} onCancel={onCancelTargeting} />
              )}
              {exposeTargetId && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <ExposeEvidencePanel
                  state={state}
                  viewerIndex={viewerIndex}
                  targetId={exposeTargetId}
                  onSubmit={onSubmitExpose}
                  onCancel={onCancelExpose}
                />
              )}
              {buyOpen && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <MarketPickerPanel state={state} viewerIndex={viewerIndex} onBuy={onBuy} onCancel={onCancelBuy} />
              )}
              {roleAbilityOpen && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <RoleAbilityPanel state={state} viewerIndex={viewerIndex} onSubmit={onSubmitRoleAbility} onCancel={onCancelRoleAbility} />
              )}
              {perkPickerOpen && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <PerkPickerPanel viewer={viewer} onSelect={onSelectPerk} onCancel={onCancelPerkPicker} />
              )}
              {activePerkId && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <PerkActionPanel state={state} viewerIndex={viewerIndex} perkId={activePerkId} onSubmit={onSubmitPerk} onCancel={onCancelPerk} />
              )}
              {state.pendingManipulate && !state.combat && !state.winner && (
                <ManipulatePanel state={state} viewerIndex={viewerIndex} onResolve={onResolveManipulate} />
              )}
              {allySupportCardId && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <AllySupportPanel state={state} viewerIndex={viewerIndex} onSubmit={onSubmitAllySupport} onCancel={onCancelAllySupport} />
              )}
              {eventCardId && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (() => {
                const eventCard = viewer.hand.find((c) => c.id === eventCardId);
                return eventCard ? (
                  <EventPanel state={state} viewerIndex={viewerIndex} card={eventCard} onSubmit={onSubmitEvent} onCancel={onCancelEvent} />
                ) : null;
              })()}
              {state.pendingMarketDiscount?.playerId === viewer.id && !state.combat && !state.pendingThreaten && !state.pendingTrade && !state.pendingExpressShipping && !state.pendingSheriff && !state.pendingManipulate && !state.pendingBodyguardSetup && !state.pendingJournal && !state.pendingEvidenceBurn && !state.pendingRecyclingBin && !state.winner && (
                <MarketDiscountPanel
                  state={state}
                  viewerIndex={viewerIndex}
                  amount={state.pendingMarketDiscount.amount}
                  onBuy={onUseMarketDiscount}
                  onSkip={onSkipMarketDiscount}
                />
              )}
              {(tradeOpen || state.pendingTrade) && !state.combat && !state.pendingThreaten && !state.pendingExpressShipping && !state.winner && (
                <TradePanel
                  key={state.pendingTrade ? `return-${state.pendingTrade.recipientId}` : 'initiate'}
                  state={state}
                  viewerIndex={viewerIndex}
                  onInitiate={onInitiateTrade}
                  onResolveReturn={onResolveTradeReturn}
                  onCancel={onCancelTrade}
                />
              )}
              {state.pendingExpressShipping && !state.combat && !state.winner && (
                <ExpressShippingPanel state={state} viewerIndex={viewerIndex} onResolve={onResolveExpressShipping} />
              )}
              {state.pendingJournal && !state.combat && !state.winner && (
                <JournalPanel state={state} viewerIndex={viewerIndex} onUse={onUseJournal} onDecline={onDeclineJournal} />
              )}
              {state.pendingEvidenceBurn && !state.pendingJournal && !state.combat && !state.winner && (
                <EvidenceBurnPanel state={state} viewerIndex={viewerIndex} onUse={onUseEvidenceBurn} onDecline={onDeclineEvidenceBurn} />
              )}
              {state.pendingRecyclingBin && !state.combat && !state.winner && (
                <RecyclingBinPanel state={state} viewerIndex={viewerIndex} onResolve={onResolveRecyclingBin} />
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
