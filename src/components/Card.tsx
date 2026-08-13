import type { ActionCard, MarketCard, AnyCard } from '../types/cards';
import { CARD_TYPE_META, MARKET_TYPE_META, CATEGORY_META } from '../constants/theme';
import { cardArtUrl } from '../constants/cardArt';

function isMarketCard(card: AnyCard): card is MarketCard {
  return 'cost' in card;
}

interface CardProps {
  card: AnyCard;
  /** Compact face-down / mini rendering for opponents' hands or the deck. */
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: (card: AnyCard) => void;
}

/**
 * A single game card. Handles both draw-pile action cards (money/evidence/
 * power/event) and market cards (perks/weapons). Purely presentational — the
 * accent color and icon come from the theme constants.
 */
export function Card({ card, faceDown, selected, disabled, onClick }: CardProps) {
  if (faceDown) {
    return <div className="cr-card cr-card--back" aria-hidden="true" />;
  }

  const market = isMarketCard(card);
  const meta = market ? MARKET_TYPE_META[(card as MarketCard).type] : CARD_TYPE_META[(card as ActionCard).type];
  const clickable = Boolean(onClick) && !disabled;
  const art = cardArtUrl(card);

  // Cards with printed art render full-face (name/type/effect are baked into
  // the image); everything else falls back to the CSS card below.
  if (art) {
    return (
      <button
        type="button"
        className={`cr-card cr-card--art${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
        style={{ '--card-accent': meta.color } as React.CSSProperties}
        disabled={disabled || !onClick}
        onClick={clickable ? () => onClick!(card) : undefined}
        title={`${card.name} — ${card.description}`}
      >
        <img className="cr-card__art" src={art} alt={card.name} loading="lazy" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`cr-card${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ '--card-accent': meta.color } as React.CSSProperties}
      disabled={disabled || !onClick}
      onClick={clickable ? () => onClick!(card) : undefined}
      title={card.description}
    >
      <header className="cr-card__head">
        <span className="cr-card__type">
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
        </span>
        {market && <span className="cr-card__cost">${(card as MarketCard).cost}</span>}
      </header>

      <div className="cr-card__name">{card.name}</div>
      <p className="cr-card__desc">{card.description}</p>

      <footer className="cr-card__foot">
        {!market && (card as ActionCard).evidenceCategories?.map((cat) => (
          <span key={cat} className="cr-tag" style={{ background: CATEGORY_META[cat].color }}>
            {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
          </span>
        ))}
        {market && (card as MarketCard).vpValue ? (
          <span className="cr-tag cr-tag--vp">★ +{(card as MarketCard).vpValue} VP</span>
        ) : null}
      </footer>
    </button>
  );
}
