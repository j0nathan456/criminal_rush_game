import { OnlineController } from './components/OnlineController';
import './game.css';

/**
 * App shell. Criminal Rush is online-only: players create or join a room by
 * code and each sees their own hand on their own device. The OnlineController's
 * first screen (create / join) is the app's landing page.
 */
function App() {
  return <OnlineController />;
}

export default App;
