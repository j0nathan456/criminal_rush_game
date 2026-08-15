import type { GameState, Player } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { getSeatPositions } from '../constants/tableLayout';
import { PlayerSeat } from './PlayerSeat';
import { TableCenter } from './TableCenter';
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
}

/**
 * The spatial "around a table" view (wide screens). Fills its container: players
 * ring an oval with the viewer pinned to the bottom, the shared centre (piles +
 * Evidence Grid) owns the middle with no scroll, and the score board / case log
 * are compact HUD overlays in the top corners. Seats layer above the overlays so
 * an overlap never blocks a click. Markets live in a separate collapsible shelf.
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
}: TableLayoutProps) {
  const positions = getSeatPositions(state.players.length, viewerIndex);

  return (
    <div className="relative h-full min-h-[70vh] w-full">
      {/* Oval table surface */}
      <div className="table-surface absolute inset-x-[4%] inset-y-[2%]" aria-hidden="true" />

      {/* Shared centre — the dominant element, no internal scroll. */}
      <div className="absolute inset-x-[21%] inset-y-[12%]">
        <TableCenter state={state} viewer={viewer} isViewersTurn={isViewersTurn} onPlayEvidence={onPlayEvidence} />
      </div>

      {/* Compact HUD overlays (behind the seats). */}
      <div className="absolute left-0 top-0 z-10 w-52 opacity-95">
        <ScoreBoard scores={state.teamScores} targets={state.vpTargets} winner={state.winner} />
      </div>
      <div className="absolute right-0 top-0 z-10 w-60 opacity-95">
        <GameLog entries={state.gameLog} />
      </div>

      {/* Seats around the edge (above overlays so they stay clickable). */}
      {state.players.map((p, i) => {
        const pos = positions[i];
        return (
          <div
            key={p.id}
            className="absolute z-20 w-44 -translate-x-1/2 -translate-y-1/2"
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
