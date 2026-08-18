import type { GameState } from '../types/game';
import type { GameAction } from '../engine';
import { GameBoard } from './GameBoard';
import { useBoardInteractions } from './useBoardInteractions';

interface PlayableBoardProps {
  state: GameState;
  viewerIndex: number;
  dispatch: (action: GameAction) => void;
}

/**
 * A GameBoard wired to a dispatch via the shared interaction hook. Chrome-free
 * so both the local and online drivers can frame it however they like.
 */
export function PlayableBoard({ state, viewerIndex, dispatch }: PlayableBoardProps) {
  const {
    selectedCardId, targeting, notice, roleAbilityOpen, activePerkId, perkPickerOpen, allySupportCardId, eventCardId,
    exposeTargetId, tradeOpen, handlers,
  } = useBoardInteractions(state, viewerIndex, dispatch);
  return (
    <GameBoard
      state={state}
      viewerIndex={viewerIndex}
      selectedCardId={selectedCardId}
      targeting={targeting}
      notice={notice}
      roleAbilityOpen={roleAbilityOpen}
      activePerkId={activePerkId}
      perkPickerOpen={perkPickerOpen}
      allySupportCardId={allySupportCardId}
      eventCardId={eventCardId}
      exposeTargetId={exposeTargetId}
      tradeOpen={tradeOpen}
      {...handlers}
    />
  );
}
