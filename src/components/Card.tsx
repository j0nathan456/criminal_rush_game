import { motion } from 'framer-motion';
import type { ActionCard, MarketCard, AnyCard } from '../types/cards';
import { CARD_TYPE_META, MARKET_TYPE_META, CATEGORY_META } from '../constants/theme';
import { cardArtUrl } from '../constants/cardArt';
import { cardHover } from '../ui/motion';

function isMarketCard(card: AnyCard): card is MarketCard {
  return 'cost' in card;
}

/**
 * Every card renders at one fixed size and 5:7 aspect ratio so hands and rows
 * stay visually uniform regardless of whether a card shows printed art or the
 * CSS fallback.
 */
const CARD_SIZE = 'w-[140px] aspect-[5/7]';

interface CardProps {
  card: AnyCard;
  /** Compact face-down / mini rendering for opponents' hands or the deck. */
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: (card: AnyCard) => void;
}

/**
 * A single game card. Handles both draw-pile action cards and market cards.
 * Cards with printed art render full-face; everything else uses the noir CSS
 * card. Accent color/icon come from the theme constants.
 */
export function Card({ card, faceDown, selected, disabled, onClick }: CardProps) {
  if (faceDown) {
    return (
      <div
        aria-hidden="true"
        className={`${CARD_SIZE} rounded-xl border border-line shadow-noir
                   bg-[repeating-linear-gradient(45deg,#161b28,#161b28_9px,#10131c_9px,#10131c_18px)]`}
      />
    );
  }

  const market = isMarketCard(card);
  const meta = market ? MARKET_TYPE_META[(card as MarketCard).type] : CARD_TYPE_META[(card as ActionCard).type];
  const clickable = Boolean(onClick) && !disabled;
  const art = cardArtUrl(card);

  const motionProps = clickable ? cardHover : {};
  const ring = selected ? 'ring-2 ring-amber ring-offset-2 ring-offset-ink' : '';
  const dim = disabled ? 'opacity-40' : '';

  if (art) {
    return (
      <motion.button
        type="button"
        {...motionProps}
        disabled={disabled || !onClick}
        onClick={clickable ? () => onClick!(card) : undefined}
        title={`${card.name} — ${card.description}`}
        className={`relative ${CARD_SIZE} overflow-hidden rounded-xl border border-line bg-white shadow-noir ${ring} ${dim}`}
      >
        <img src={art} alt={card.name} loading="lazy" className="block h-full w-full object-contain" />
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      {...motionProps}
      disabled={disabled || !onClick}
      onClick={clickable ? () => onClick!(card) : undefined}
      title={card.description}
      style={{ borderTopColor: meta.color }}
      className={`flex ${CARD_SIZE} flex-col gap-1.5 overflow-hidden rounded-xl border border-t-[3px]
                  border-line bg-panel-2/90 p-2.5 text-left shadow-noir ${ring} ${dim}`}
    >
      <header className="flex items-center justify-between text-xs">
        <span className="font-bold" style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
        </span>
        {market && (
          <span className="rounded-md px-1.5 font-extrabold text-ink" style={{ background: meta.color }}>
            ${(card as MarketCard).cost}
          </span>
        )}
      </header>

      <div className="text-[15px] font-extrabold leading-tight text-chalk">{card.name}</div>
      <p className="grow text-xs leading-snug text-fog">{card.description}</p>

      <footer className="flex flex-wrap gap-1">
        {!market &&
          (card as ActionCard).evidenceCategories?.map((cat) => (
            <span key={cat} className="chip text-ink" style={{ background: CATEGORY_META[cat].color }}>
              {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
            </span>
          ))}
        {market && (card as MarketCard).vpValue ? (
          <span className="chip bg-amber text-ink">★ +{(card as MarketCard).vpValue} VP</span>
        ) : null}
      </footer>
    </motion.button>
  );
}
