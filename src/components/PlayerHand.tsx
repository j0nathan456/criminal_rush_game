import type { ActionCard, AnyCard } from '../types/cards';
import { Card } from './Card';

interface PlayerHandProps {
  cards: ActionCard[];
  selectedId?: string | null;
  onSelect?: (card: AnyCard) => void;
}

/**
 * The active player's hand of action cards, laid out as a fanned row.
 */
export function PlayerHand({ cards, selectedId, onSelect }: PlayerHandProps) {
  return (
    <section className="cr-hand" aria-label="Your hand">
      <header className="cr-panel__head">
        <h2>Your Hand</h2>
        <span className="cr-hand__count">{cards.length} cards</span>
      </header>

      {cards.length === 0 ? (
        <p className="cr-empty">No cards in hand.</p>
      ) : (
        <div className="cr-hand__cards">
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              selected={card.id === selectedId}
              onClick={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
