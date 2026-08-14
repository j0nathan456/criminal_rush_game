import { motion } from 'framer-motion';
import type { ActionCard, AnyCard } from '../types/cards';
import { Card } from './Card';
import { stagger, riseItem } from '../ui/motion';

interface PlayerHandProps {
  cards: ActionCard[];
  selectedId?: string | null;
  onSelect?: (card: AnyCard) => void;
}

/** The active player's hand, dealt in with a stagger. */
export function PlayerHand({ cards, selectedId, onSelect }: PlayerHandProps) {
  return (
    <section className="panel" aria-label="Your hand">
      <header className="panel-head">
        <h2 className="panel-title">Your Hand</h2>
        <span className="text-xs text-fog">{cards.length} cards</span>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-fog">No cards in hand.</p>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-3">
          {cards.map((card) => (
            <motion.div key={card.id} variants={riseItem}>
              <Card card={card} selected={card.id === selectedId} onClick={onSelect} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
