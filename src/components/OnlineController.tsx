import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnlineGame } from '../online/useOnlineGame';
import { MIN_PLAYERS } from '../online/room';
import { TEAM_META } from '../constants/theme';
import { PlayableBoard } from './PlayableBoard';
import { HowToPlay } from './HowToPlay';
import { panelIn, backdrop } from '../ui/motion';

interface OnlineControllerProps {
  /** Optional: return to a parent shell. Omitted when online is the app root. */
  onExit?: () => void;
}

/**
 * Online driver. Owns the useOnlineGame hook and walks through three phases:
 * create/join → waiting room → live game. Server holds authoritative state and
 * sends this client only its own redacted view.
 */
export function OnlineController({ onExit }: OnlineControllerProps) {
  const game = useOnlineGame();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showRules, setShowRules] = useState(false);
  const rules = <HowToPlay open={showRules} onClose={() => setShowRules(false)} />;

  const leave = () => {
    game.leave();
    onExit?.();
  };

  // --- Phase 1: not in a room yet ---
  if (!game.view) {
    return (
      <div className="stage">
        <motion.div variants={panelIn} initial="hidden" animate="show" className="panel w-full max-w-md p-7">
          {onExit && (
            <button type="button" className="btn btn-ghost mb-2 px-2 py-1 text-sm text-fog" onClick={onExit}>
              ← Back
            </button>
          )}
          <img
            src={`${import.meta.env.BASE_URL ?? '/'}branding/title.png`}
            alt="Criminal Rush — Save the City… or Control It"
            className="mx-auto w-full max-w-xs"
          />
          <div className="gold-rule my-5" />
          <p className="mb-4 text-center text-sm text-fog">
            Enter your name, then create a new room or join one with a code.
          </p>

          <label htmlFor="player-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fog/80">
            Your name <span className="text-crim">*</span> <span className="normal-case text-fog/60">(needed either way)</span>
          </label>
          <input
            id="player-name"
            className="input"
            placeholder="e.g. Ava"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="gold-rule my-5" />

          <button
            type="button"
            className="btn btn-primary w-full py-3 text-base"
            disabled={!name.trim() || game.connecting}
            onClick={() => game.createRoom(name.trim())}
          >
            Create room
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-fog/60">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <label htmlFor="room-code" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-fog/80">
            Have a room code?
          </label>
          <div className="flex gap-2">
            <input
              id="room-code"
              className="input flex-[2]"
              placeholder="Room code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn flex-1"
              disabled={!name.trim() || code.trim().length < 4 || game.connecting}
              onClick={() => game.joinRoom(code.trim(), name.trim())}
            >
              Join
            </button>
          </div>
          {!name.trim() && code.trim().length >= 4 && (
            <p className="mt-2 text-xs text-amber">Enter your name above to join.</p>
          )}
          <p className="mt-2 text-xs text-fog/70">
            Already mid-game and lost your session? Enter the same name you joined with — this rejoins your seat.
          </p>

          {game.error && <p className="mt-4 text-center text-sm text-crim">{game.error}</p>}

          <button
            type="button"
            className="btn btn-ghost mt-5 w-full text-sm text-teal"
            onClick={() => setShowRules(true)}
          >
            📖 New here? How to Play
          </button>
        </motion.div>
        {rules}
      </div>
    );
  }

  const { view } = game;

  // --- Phase 2: waiting room ---
  if (!view.started || !view.state) {
    return (
      <div className="stage">
        <motion.div variants={panelIn} initial="hidden" animate="show" className="panel w-full max-w-md p-7">
          <h1 className="text-center text-3xl font-extrabold">Waiting room</h1>
          <p className="mt-1 text-center text-sm text-fog">Share this code so others can join:</p>
          <div className="my-4 rounded-xl bg-panel-2 py-4 text-center text-5xl font-extrabold tracking-[0.35em] text-amber">
            {view.code}
          </div>

          <div className="mb-4 flex flex-col gap-2">
            {view.seats.map((s) => (
              <motion.div
                key={s.seat}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-lg bg-panel-2/60 px-3 py-2"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-line text-xs font-bold">
                  {s.seat + 1}
                </span>
                <span className="flex-1 text-sm">
                  {s.name}
                  {s.seat === view.yourSeat ? ' (you)' : ''}
                  {s.seat === 0 ? ' · host' : ''}
                </span>
                {view.isHost && s.seat !== 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-xs text-crim"
                    disabled={game.connecting}
                    onClick={() => game.kick(s.seat)}
                    aria-label={`Remove ${s.name}`}
                    title={`Remove ${s.name}`}
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {view.isHost ? (
              <button
                type="button"
                className="btn btn-primary w-full py-3 text-base"
                disabled={view.seats.length < MIN_PLAYERS || game.connecting}
                onClick={() => game.start()}
              >
                {view.seats.length < MIN_PLAYERS ? `Need ${MIN_PLAYERS - view.seats.length} more` : 'Start Game'}
              </button>
            ) : (
              <p className="text-center text-sm text-fog">Waiting for the host to start…</p>
            )}
            <button type="button" className="btn w-full" onClick={leave}>
              Leave
            </button>
          </div>

          {game.error && <p className="mt-4 text-center text-sm text-crim">{game.error}</p>}

          <button
            type="button"
            className="btn btn-ghost mt-4 w-full text-sm text-teal"
            onClick={() => setShowRules(true)}
          >
            📖 How to Play
          </button>
        </motion.div>
        {rules}
      </div>
    );
  }

  // --- Phase 3: live game ---
  const current = view.state.players[view.state.currentPlayerIndex];
  const yourTurn = view.state.currentPlayerIndex === view.yourSeat;
  const winner = view.state.winner ?? view.winner;

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-4 px-4 pt-3">
        <button type="button" className="btn px-3 py-1.5 text-sm" onClick={leave}>
          ← Leave
        </button>
        <span className="font-bold tracking-[0.2em] text-fog">Room {view.code}</span>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1.5 text-sm text-teal"
          onClick={() => setShowRules(true)}
          aria-label="How to play"
        >
          📖 Rules
        </button>
        <span className="ml-auto text-sm">
          {winner ? (
            <strong style={{ color: TEAM_META[winner].color }}>{TEAM_META[winner].label} win</strong>
          ) : yourTurn ? (
            <strong className="text-amber">Your turn</strong>
          ) : (
            <>
              Waiting for <strong style={{ color: TEAM_META[current.team].color }}>{current.name}</strong>
            </>
          )}
        </span>
      </div>

      <PlayableBoard state={view.state} viewerIndex={view.yourSeat} dispatch={game.dispatch} />
      {game.error && <p className="px-4 text-sm text-crim">{game.error}</p>}

      {rules}

      <AnimatePresence>
        {winner && (
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5 backdrop-blur-sm"
            role="dialog"
            aria-label="Game over"
          >
            <motion.div
              variants={panelIn}
              className="panel w-full max-w-md border-2 p-8 text-center"
              style={{ borderColor: TEAM_META[winner].color }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
                className="text-6xl"
              >
                🏆
              </motion.div>
              <h2 className="mt-2 text-3xl font-extrabold" style={{ color: TEAM_META[winner].color }}>
                {TEAM_META[winner].label} win!
              </h2>
              <p className="mt-2 text-fog">
                {view.yourSeat >= 0 && view.state.players[view.yourSeat]?.team === winner
                  ? 'Victory — your team took it.'
                  : 'Better luck next time.'}
              </p>
              <div className="mt-6 flex gap-2">
                <button type="button" className="btn btn-primary flex-1 py-3" onClick={() => game.leave()}>
                  Play again
                </button>
                <button type="button" className="btn flex-1 py-3" onClick={leave}>
                  Exit to menu
                </button>
              </div>
              <p className="mt-4 text-xs text-fog">“Play again” returns you to the lobby to create or join a new room.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
