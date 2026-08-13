import { useState } from 'react';
import { SUPPORTED_PLAYER_COUNTS } from '../setup';

interface LobbyProps {
  onStart: (playerNames: string[]) => void;
}

const MIN = Math.min(...SUPPORTED_PLAYER_COUNTS);
const MAX = Math.max(...SUPPORTED_PLAYER_COUNTS);

/**
 * Pre-game lobby. Collects 4-8 player names (pass-and-play) and starts a game.
 * The "matching code" join flow will slot in here once the backend exists.
 */
export function Lobby({ onStart }: LobbyProps) {
  const [names, setNames] = useState<string[]>(['', '', '', '']);

  const setName = (i: number, value: string) =>
    setNames((cur) => cur.map((n, j) => (j === i ? value : n)));

  const addSeat = () => setNames((cur) => (cur.length < MAX ? [...cur, ''] : cur));
  const removeSeat = (i: number) =>
    setNames((cur) => (cur.length > MIN ? cur.filter((_, j) => j !== i) : cur));

  const trimmed = names.map((n) => n.trim());
  const allNamed = trimmed.every((n) => n.length > 0);
  const canStart = allNamed && trimmed.length >= MIN && trimmed.length <= MAX;

  return (
    <div className="cr-lobby">
      <div className="cr-lobby__card">
        <h1 className="cr-lobby__title">Criminal Rush</h1>
        <p className="cr-lobby__tag">Save the City… or Control It</p>

        <div className="cr-lobby__seats">
          {names.map((name, i) => (
            <div key={i} className="cr-lobby__seat">
              <span className="cr-lobby__num">{i + 1}</span>
              <input
                className="cr-lobby__input"
                placeholder={`Player ${i + 1} name`}
                value={name}
                maxLength={20}
                onChange={(e) => setName(i, e.target.value)}
              />
              <button
                type="button"
                className="cr-lobby__remove"
                onClick={() => removeSeat(i)}
                disabled={names.length <= MIN}
                aria-label={`Remove player ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="cr-lobby__actions">
          <button type="button" className="cr-lobby__add" onClick={addSeat} disabled={names.length >= MAX}>
            + Add player
          </button>
          <button type="button" className="cr-lobby__start" onClick={() => onStart(trimmed)} disabled={!canStart}>
            Start Game
          </button>
        </div>

        <p className="cr-lobby__hint">
          {names.length} players · supports {MIN}–{MAX}. {!allNamed && 'Enter a name for every seat.'}
        </p>
      </div>
    </div>
  );
}
