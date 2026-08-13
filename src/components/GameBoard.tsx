import type { GameState, Player, CombatSide } from '../types/game';
import type { EvidenceCategory, AnyCard, MarketCard } from '../types/cards';
import type { ActionMeta } from '../constants/theme';
import type { RoleAbilityPayload, PerkPayload, EventOptions } from '../engine';
import type { CombatChoiceInput } from '../types/game';
import { TEAM_META } from '../constants/theme';

import { ScoreBoard } from './ScoreBoard';
import { EvidenceGrid } from './EvidenceGrid';
import { RoleCard } from './RoleCard';
import { PlayerHand } from './PlayerHand';
import { Market } from './Market';
import { ActionBar } from './ActionBar';
import { GameLog } from './GameLog';
import { PlayerSeat } from './PlayerSeat';
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
 * Top-level board layout. A pure view of GameState + callbacks; it holds no
 * game logic. The `setup` layer (via GameController) connects it to the
 * engine's reducer.
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
    // attack: opposing team, engine validates neighbor / exposed rules on dispatch
    return p.team !== viewer.team;
  };

  const selectedCard = viewer?.hand.find((c) => c.id === selectedCardId);
  const canPlaySelected = Boolean(selectedCard) && selectedCard?.type !== 'EVIDENCE' && selectedCard?.type !== 'POWER';

  return (
    <div className="cr-board">
      <header className="cr-topbar">
        <div className="cr-brand">
          <span className="cr-brand__title">Criminal Rush</span>
          <span className="cr-brand__tag">Save the City… or Control It</span>
        </div>
        {current && (
          <div className="cr-turn-indicator">
            Current turn:{' '}
            <strong style={{ color: TEAM_META[current.team].color }}>{current.name}</strong>
          </div>
        )}
      </header>

      {state.winner && (
        <div className="cr-winner" style={{ background: TEAM_META[state.winner].soft, color: TEAM_META[state.winner].color }}>
          🏆 {TEAM_META[state.winner].label} win the game!
        </div>
      )}

      {(notice || targeting) && !state.winner && !state.combat && (
        <div className="cr-notice">
          <span>{targeting ? `Select a target to ${targeting}.` : notice}</span>
          {targeting && (
            <button type="button" className="cr-notice__cancel" onClick={onCancelTargeting}>
              Cancel
            </button>
          )}
        </div>
      )}

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
        <RoleAbilityPanel
          state={state}
          viewerIndex={viewerIndex}
          onSubmit={onSubmitRoleAbility}
          onCancel={onCancelRoleAbility}
        />
      )}

      {activePerkId && !state.combat && !state.winner && (
        <PerkActionPanel
          state={state}
          viewerIndex={viewerIndex}
          perkId={activePerkId}
          onSubmit={onSubmitPerk}
          onCancel={onCancelPerk}
        />
      )}

      {allySupportCardId && !state.combat && !state.winner && (
        <AllySupportPanel
          state={state}
          viewerIndex={viewerIndex}
          onSubmit={onSubmitAllySupport}
          onCancel={onCancelAllySupport}
        />
      )}

      <div className="cr-board__grid">
        <aside className="cr-board__left">
          <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
          <section className="cr-seats" aria-label="Players">
            <header className="cr-panel__head"><h2>Players</h2></header>
            <div className="cr-seats__list">
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
        </aside>

        <main className="cr-board__center">
          <EvidenceGrid
            grid={state.evidenceGrid}
            onSlotClick={isViewersTurn && viewer?.team === 'CIVILIAN' ? onPlayEvidence : undefined}
          />
          <Market
            title="Market"
            subtitle="5 cards · open to all"
            cards={state.publicMarket}
            affordableUpTo={viewer?.money}
            onBuy={isViewersTurn ? onBuy : undefined}
            variant="public"
          />
          {viewer?.team === 'CRIMINAL' && (
            <Market
              title="Black Market"
              subtitle="Criminals only"
              cards={state.blackMarket}
              affordableUpTo={viewer?.money}
              onBuy={isViewersTurn ? onBuy : undefined}
              variant="black"
            />
          )}
        </main>

        <aside className="cr-board__right">
          <GameLog entries={state.gameLog} />
        </aside>
      </div>

      {viewer && (
        <footer className="cr-board__player">
          <RoleCard player={viewer} active={isViewersTurn} />

          <div className="cr-board__handcol">
            <PlayerHand cards={viewer.hand} selectedId={selectedCardId} onSelect={onSelectCard} />
            {canPlaySelected && (
              <button type="button" className="cr-play-selected" onClick={onPlaySelected}>
                Play {selectedCard!.name}
              </button>
            )}
            {viewer.inventory.length > 0 && (
              <section className="cr-inventory" aria-label="Your items">
                <header className="cr-panel__head"><h2>Items</h2></header>
                <div className="cr-inventory__list">
                  {viewer.inventory.map((item) => (
                    <div key={item.id} className="cr-inventory__item">
                      <span>{item.name}</span>
                      <span className="cr-inventory__buttons">
                        {isViewersTurn && onUsePerk && ACTIONABLE_PERKS.has(item.name) && (
                          <button type="button" className="cr-inventory__use" onClick={() => onUsePerk(item.id)}>
                            Use
                          </button>
                        )}
                        {onSell && item.type !== 'SPECIAL' && item.name !== 'Investment' && (
                          <button type="button" className="cr-inventory__sell" onClick={() => onSell(item)}>
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
              <button type="button" className="cr-play-selected" onClick={onClearTraffic}>
                Clear Traffic token ($1)
              </button>
            )}
          </div>

          <ActionBar
            player={viewer}
            onAction={isViewersTurn ? onAction : undefined}
            onEndTurn={isViewersTurn ? onEndTurn : undefined}
          />
        </footer>
      )}
    </div>
  );
}
