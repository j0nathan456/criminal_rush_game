import { useCriminalRush } from '../setup';
import { PlayableBoard } from './PlayableBoard';

interface GameControllerProps {
  playerNames: string[];
  onExit: () => void;
}

/**
 * Local pass-and-play driver: binds the in-browser reducer (useCriminalRush) to
 * the GameBoard. The viewer is always the current player, so the device is
 * handed around the table.
 */
export function GameController({ playerNames, onExit }: GameControllerProps) {
  const [state, dispatch] = useCriminalRush(playerNames);
  return (
    <div className="cr-game">
      <div className="cr-game__bar">
        <button type="button" className="cr-game__exit" onClick={onExit}>
          ← New game
        </button>
      </div>
      <PlayableBoard state={state} viewerIndex={state.currentPlayerIndex} dispatch={dispatch} />
    </div>
  );
}
