import { useState } from 'react';
import { Lobby } from './components/Lobby';
import { GameController } from './components/GameController';
import { OnlineController } from './components/OnlineController';
import './game.css';

type Screen =
  | { name: 'home' }
  | { name: 'local-lobby' }
  | { name: 'local-game'; players: string[] }
  | { name: 'online' };

/**
 * App shell. Home offers local pass-and-play or online (join-by-code) play.
 */
function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  if (screen.name === 'home') {
    return (
      <div className="cr-lobby">
        <div className="cr-lobby__card">
          <h1 className="cr-lobby__title">Criminal Rush</h1>
          <p className="cr-lobby__tag">Save the City… or Control It</p>
          <div className="cr-home__modes">
            <button type="button" className="cr-lobby__start" onClick={() => setScreen({ name: 'local-lobby' })}>
              Local pass &amp; play
            </button>
            <button type="button" className="cr-home__online" onClick={() => setScreen({ name: 'online' })}>
              Play online (join by code)
            </button>
          </div>
          <p className="cr-lobby__hint">4–8 players · 30–60 min</p>
        </div>
      </div>
    );
  }

  if (screen.name === 'local-lobby') {
    return <Lobby onStart={(players) => setScreen({ name: 'local-game', players })} />;
  }

  if (screen.name === 'local-game') {
    return <GameController playerNames={screen.players} onExit={() => setScreen({ name: 'home' })} />;
  }

  return <OnlineController onExit={() => setScreen({ name: 'home' })} />;
}

export default App;
