import { motion } from 'framer-motion';

interface GameLogProps {
  entries: string[];
  /** Most recent entries are shown first when true. */
  newestFirst?: boolean;
}

/**
 * A running log of game events. The newest entry is highlighted with a gold
 * rule and slides in.
 */
export function GameLog({ entries, newestFirst = true }: GameLogProps) {
  const ordered = newestFirst ? [...entries].reverse() : entries;

  return (
    <section className="panel" aria-label="Game log">
      <header className="panel-head">
        <h2 className="panel-title">Case Log</h2>
      </header>
      <ol className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto pr-1">
        {ordered.map((entry, i) => (
          <motion.li
            key={`${ordered.length - i}-${entry}`}
            initial={i === 0 ? { opacity: 0, x: -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            className={`rounded-md px-2.5 py-1.5 text-[13px] ${
              i === 0
                ? 'border-l-2 border-amber bg-amber/5 text-chalk'
                : 'bg-panel-2/60 text-fog'
            }`}
          >
            {entry}
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
