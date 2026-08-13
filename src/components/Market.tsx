import type { MarketCard, AnyCard } from '../types/cards';
import { Card } from './Card';

interface MarketProps {
  title: string;
  subtitle?: string;
  cards: MarketCard[];
  /** Money the viewing player has, used to disable cards they cannot afford. */
  affordableUpTo?: number;
  onBuy?: (card: AnyCard) => void;
  variant?: 'public' | 'black';
}

/**
 * A market row — the public Market (5 cards) or the Black Market (Criminals
 * only, 3 cards + Expand Network). Cards over the player's budget are dimmed.
 */
export function Market({ title, subtitle, cards, affordableUpTo, onBuy, variant = 'public' }: MarketProps) {
  return (
    <section className={`cr-market cr-market--${variant}`} aria-label={title}>
      <header className="cr-panel__head">
        <h2>{title}</h2>
        {subtitle && <span className="cr-market__subtitle">{subtitle}</span>}
      </header>

      <div className="cr-market__cards">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            disabled={affordableUpTo !== undefined && card.cost > affordableUpTo}
            onClick={onBuy}
          />
        ))}
      </div>
    </section>
  );
}
