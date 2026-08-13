interface GameLogProps {
  entries: string[];
  /** Most recent entries are shown first when true. */
  newestFirst?: boolean;
}

/**
 * A running log of game events. The engine appends human-readable strings to
 * `gameState.gameLog`; this just renders them.
 */
export function GameLog({ entries, newestFirst = true }: GameLogProps) {
  const ordered = newestFirst ? [...entries].reverse() : entries;

  return (
    <section className="cr-log" aria-label="Game log">
      <header className="cr-panel__head">
        <h2>Game Log</h2>
      </header>
      <ol className="cr-log__list">
        {ordered.map((entry, i) => (
          <li key={`${i}-${entry}`} className="cr-log__entry">
            {entry}
          </li>
        ))}
      </ol>
    </section>
  );
}
