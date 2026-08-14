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
 * A market row — the public Market or the Criminals-only Black Market. Cards
 * over the player's budget are dimmed.
 */
export function Market({ title, subtitle, cards, affordableUpTo, onBuy, variant = 'public' }: MarketProps) {
  return (
    <section
      className={`panel ${variant === 'black' ? 'border-crim/30 bg-gradient-to-b from-crim/10 to-transparent' : ''}`}
      aria-label={title}
    >
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {subtitle && <span className="text-xs text-fog">{subtitle}</span>}
      </header>

      <div className="flex flex-wrap gap-3">
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
