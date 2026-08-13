import { useState } from 'react';
import { useOnlineGame } from '../online/useOnlineGame';
import { MIN_PLAYERS } from '../online/room';
import { TEAM_META } from '../constants/theme';
import { PlayableBoard } from './PlayableBoard';

interface OnlineControllerProps {
  onExit: () => void;
}

/**
 * Online driver. Owns the useOnlineGame hook and walks through three phases:
 * create/join → waiting room → live game. The server holds authoritative state
 * and only sends this client its own redacted view.
 */
export function OnlineController({ onExit }: OnlineControllerProps) {
  const game = useOnlineGame();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const leave = () => {
    game.leave();
    onExit();
  };

  // --- Phase 1: not in a room yet ---
  if (!game.view) {
    return (
      <div className="cr-lobby">
        <div className="cr-lobby__card">
          <button type="button" className="cr-game__exit" onClick={onExit}>← Back</button>
          <h1 className="cr-lobby__title">Play Online</h1>
          <p className="cr-lobby__tag">Create a room, then share the code with friends.</p>

          <input
            className="cr-lobby__input"
            placeholder="Your name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="cr-lobby__actions">
            <button
              type="button"
              className="cr-lobby__start"
              disabled={!name.trim() || game.connecting}
              onClick={() => game.createRoom(name.trim())}
            >
              Create room
            </button>
          </div>

          <div className="cr-online__join">
            <input
              className="cr-lobby__input"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="cr-lobby__add"
              disabled={!name.trim() || code.trim().length < 4 || game.connecting}
              onClick={() => game.joinRoom(code.trim(), name.trim())}
            >
              Join
            </button>
          </div>

          {game.error && <p className="cr-online__error">{game.error}</p>}
        </div>
      </div>
    );
  }

  const { view } = game;

  // --- Phase 2: in the waiting room ---
  if (!view.started || !view.state) {
    return (
      <div className="cr-lobby">
        <div className="cr-lobby__card">
          <h1 className="cr-lobby__title">Waiting room</h1>
          <p className="cr-lobby__tag">Share this code so others can join:</p>
          <div className="cr-online__code">{view.code}</div>

          <div className="cr-online__seats">
            {view.seats.map((s) => (
              <div key={s.seat} className="cr-online__seat">
                <span className="cr-lobby__num">{s.seat + 1}</span>
                <span>
                  {s.name}
                  {s.seat === view.yourSeat ? ' (you)' : ''}
                  {s.seat === 0 ? ' · host' : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="cr-lobby__actions">
            {view.isHost ? (
              <button
                type="button"
                className="cr-lobby__start"
                disabled={view.seats.length < MIN_PLAYERS || game.connecting}
                onClick={() => game.start()}
              >
                {view.seats.length < MIN_PLAYERS
                  ? `Need ${MIN_PLAYERS - view.seats.length} more`
                  : 'Start Game'}
              </button>
            ) : (
              <p className="cr-lobby__hint">Waiting for the host to start…</p>
            )}
            <button type="button" className="cr-lobby__add" onClick={leave}>Leave</button>
          </div>

          {game.error && <p className="cr-online__error">{game.error}</p>}
        </div>
      </div>
    );
  }

  // --- Phase 3: live game ---
  const current = view.state.players[view.state.currentPlayerIndex];
  const yourTurn = view.state.currentPlayerIndex === view.yourSeat;
  const winner = view.state.winner ?? view.winner;

  return (
    <div className="cr-game">
      <div className="cr-game__bar cr-online__bar">
        <button type="button" className="cr-game__exit" onClick={leave}>← Leave</button>
        <span className="cr-online__roomcode">Room {view.code}</span>
        <span className="cr-online__turn">
          {winner ? (
            <strong style={{ color: TEAM_META[winner].color }}>{TEAM_META[winner].label} win</strong>
          ) : yourTurn ? (
            <strong style={{ color: '#f5c518' }}>Your turn</strong>
          ) : (
            <>Waiting for <strong style={{ color: TEAM_META[current.team].color }}>{current.name}</strong></>
          )}
        </span>
      </div>
      <PlayableBoard state={view.state} viewerIndex={view.yourSeat} dispatch={game.dispatch} />
      {game.error && <p className="cr-online__error">{game.error}</p>}

      {winner && (
        <div className="cr-endgame" role="dialog" aria-label="Game over">
          <div className="cr-endgame__card" style={{ borderColor: TEAM_META[winner].color }}>
            <div className="cr-endgame__trophy">🏆</div>
            <h2 className="cr-endgame__title" style={{ color: TEAM_META[winner].color }}>
              {TEAM_META[winner].label} win!
            </h2>
            <p className="cr-endgame__sub">
              {view.yourSeat >= 0 && view.state.players[view.yourSeat]?.team === winner
                ? 'Victory — your team took it.'
                : 'Better luck next time.'}
            </p>
            <div className="cr-endgame__actions">
              {/* Play again: drop back to the lobby (name kept) to spin up a fresh room. */}
              <button type="button" className="cr-lobby__start" onClick={() => game.leave()}>
                Play again
              </button>
              <button type="button" className="cr-lobby__add" onClick={leave}>
                Exit to menu
              </button>
            </div>
            <p className="cr-endgame__hint">“Play again” returns you to the lobby to create or join a new room.</p>
          </div>
        </div>
      )}
    </div>
  );
}
