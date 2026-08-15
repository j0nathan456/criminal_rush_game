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
 * with the viewer pinned to the bottom; the shared zones sit in the centre;
 * the score board and case log float in the top corners.
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
    <div className="relative min-h-[600px] w-full">
      {/* Oval table surface */}
      <div className="table-surface absolute inset-x-[6%] inset-y-[4%]" aria-hidden="true" />

      {/* Shared zones in the literal centre of the table */}
      <div className="absolute inset-x-[26%] inset-y-[22%] overflow-y-auto">
        <SharedZones
          state={state}
          viewer={viewer}
          isViewersTurn={isViewersTurn}
          onPlayEvidence={onPlayEvidence}
          onBuy={onBuy}
        />
      </div>

      {/* Seats around the edge */}
      {state.players.map((p, i) => {
        const pos = positions[i];
        return (
          <div
            key={p.id}
            className="absolute w-40 -translate-x-1/2 -translate-y-1/2"
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

      {/* Corner overlays */}
      <div className="absolute left-0 top-0 w-64">
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
      </div>
      <div className="absolute right-0 top-0 w-72">
        <GameLog entries={state.gameLog} />
      </div>
    </div>
  );
}
