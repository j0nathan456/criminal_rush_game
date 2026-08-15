import type { GameState, Player } from '../types/game';
import type { EvidenceCategory, AnyCard } from '../types/cards';
import { getSeatPositions } from '../constants/tableLayout';
import { PlayerSeat } from './PlayerSeat';
import { SharedZones } from './SharedZones';
import { ScoreBoard } from './ScoreBoard';
import { GameLog } from './GameLog';

interface TableLayoutProps {
  state: GameState;
  viewerIndex: number;
  viewer?: Player;
  isViewersTurn: boolean;
  /** True while the board is asking the viewer to pick a target. */
  targeting: boolean;
  isTargetable: (player: Player) => boolean;
  onSelectTarget?: (playerId: string) => void;
  onPlayEvidence?: (category: EvidenceCategory) => void;
  onBuy?: (card: AnyCard) => void;
}

/**
 * The spatial "around a table" view (wide screens only). Players ring an oval
 * with the viewer pinned to the bottom; the shared zones (piles, evidence, and
 * markets) sit in the centre; the score board and case log float in the top
 * corners. Seats layer above the corner overlays so an overlap never blocks a
 * click.
 */
export function TableLayout({
  state,
  viewerIndex,
  viewer,
  isViewersTurn,
  targeting,
  isTargetable,
  onSelectTarget,
  onPlayEvidence,
  onBuy,
}: TableLayoutProps) {
  const positions = getSeatPositions(state.players.length, viewerIndex);

  return (
    <div className="relative min-h-[680px] w-full">
      {/* Oval table surface */}
      <div className="table-surface absolute inset-x-[4%] inset-y-[2%]" aria-hidden="true" />

      {/* Shared zones in the centre of the table (scrolls if it overflows). */}
      <div className="absolute inset-x-[19%] inset-y-[16%] overflow-y-auto rounded-2xl bg-ink/30 p-3 ring-1 ring-line/50">
        <SharedZones
          state={state}
          viewer={viewer}
          isViewersTurn={isViewersTurn}
          onPlayEvidence={onPlayEvidence}
          onBuy={onBuy}
        />
      </div>

      {/* Corner overlays (behind the seats). */}
      <div className="absolute left-0 top-0 z-10 w-56">
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
      </div>
      <div className="absolute right-0 top-0 z-10 w-64">
        <GameLog entries={state.gameLog} />
      </div>

      {/* Seats around the edge (above overlays so they stay clickable). */}
      {state.players.map((p, i) => {
        const pos = positions[i];
        return (
          <div
            key={p.id}
            className="absolute z-20 w-40 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
          >
            <PlayerSeat
              player={p}
              active={i === state.currentPlayerIndex}
              isSelf={pos.isViewer}
              isNeighbor={pos.isNeighbor}
              targetable={isTargetable(p)}
              onClick={targeting ? (pl) => onSelectTarget?.(pl.id) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
