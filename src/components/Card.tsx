import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActionCard, MarketCard, AnyCard } from '../types/cards';
import { CARD_TYPE_META, MARKET_TYPE_META, CATEGORY_META } from '../constants/theme';
import { cardArtUrl } from '../constants/cardArt';
import { cardHover } from '../ui/motion';

function isMarketCard(card: AnyCard): card is MarketCard {
  return 'cost' in card;
}

/** The type accent (color/label/icon) for any card, from the theme constants. */
function typeMeta(card: AnyCard) {
  return isMarketCard(card)
    ? MARKET_TYPE_META[(card as MarketCard).type]
    : CARD_TYPE_META[(card as ActionCard).type];
}

/**
 * Every card renders at one fixed size and 5:7 aspect ratio so hands and rows
 * stay visually uniform regardless of whether a card shows printed art or the
 * CSS fallback.
 */
const CARD_SIZE = 'w-[140px] aspect-[5/7]';

interface CardProps {
  /** The card to render. Optional only because `faceDown` needs no card. */
  card?: AnyCard;
  /** Compact face-down / mini rendering for opponents' hands or the deck. */
  faceDown?: boolean;
  selected?: boolean;
  /** Fully unavailable (e.g. unaffordable market card): dimmed and unclickable. */
  disabled?: boolean;
  /** Legal-but-not-now (e.g. a Power card outside combat): dimmed, still clickable. */
  dimmed?: boolean;
  /** Reason a card is dimmed/disabled, surfaced in the tooltip. */
  reason?: string;
  /** Show an enlarged, readable preview of the card on hover. */
  preview?: boolean;
  onClick?: (card: AnyCard) => void;
}

/**
 * A single game card. Handles both draw-pile action cards and market cards.
 * Cards with printed art render full-face; everything else uses the noir CSS
 * card. The border is color-coded by card type (theme constants); on `preview`
 * an enlarged, readable copy floats above the card while hovered.
 */
export function Card({ card, faceDown, selected, disabled, dimmed, reason, preview, onClick }: CardProps) {
  const [hovered, setHovered] = useState(false);

  if (faceDown || !card) {
    return (
      <div
        aria-hidden="true"
        className={`${CARD_SIZE} rounded-xl border border-line shadow-noir
                   bg-[repeating-linear-gradient(45deg,#161b28,#161b28_9px,#10131c_9px,#10131c_18px)]`}
      />
    );
  }

  const market = isMarketCard(card);
  const meta = typeMeta(card);
  const clickable = Boolean(onClick) && !disabled;
  const art = cardArtUrl(card);

  const motionProps = clickable ? cardHover : {};
  const ring = selected ? 'ring-2 ring-amber ring-offset-2 ring-offset-ink' : '';
  const dim = disabled ? 'opacity-40' : dimmed ? 'opacity-50 grayscale' : '';
  // Type-coded border for every card, so Power/Evidence/Money/Event read at a glance.
  const typeBorder: React.CSSProperties = { borderColor: meta.color };
  const title = reason ? `${card.name} — ${reason}` : market ? `${card.name} — ${card.description}` : card.description;

  const button = art ? (
    <motion.button
      type="button"
      {...motionProps}
      disabled={disabled || !onClick}
      onClick={clickable ? () => onClick!(card) : undefined}
      title={title}
      style={typeBorder}
      className={`relative ${CARD_SIZE} overflow-hidden rounded-xl border-2 bg-white shadow-noir ${ring} ${dim}`}
    >
      <img src={art} alt={card.name} loading="lazy" className="block h-full w-full object-contain" />
    </motion.button>
  ) : (
    <motion.button
      type="button"
      {...motionProps}
      disabled={disabled || !onClick}
      onClick={clickable ? () => onClick!(card) : undefined}
      title={title}
      style={typeBorder}
      className={`flex ${CARD_SIZE} flex-col gap-1.5 overflow-hidden rounded-xl border-2
                  bg-panel-2/90 p-2.5 text-left shadow-noir ${ring} ${dim}`}
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

  if (!preview) return button;

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {button}
      <AnimatePresence>
        {hovered && <CardPreview card={card} art={art} meta={meta} />}
      </AnimatePresence>
    </div>
  );
}

/** An enlarged, readable copy of a card, floated above it on hover. */
function CardPreview({
  card,
  art,
  meta,
}: {
  card: AnyCard;
  art: string | undefined;
  meta: { label: string; color: string; icon: string };
}) {
  const market = isMarketCard(card);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.12 }}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2
                 rounded-2xl border-2 bg-panel p-3 shadow-noir"
      style={{ borderColor: meta.color }}
    >
      {art && (
        <img src={art} alt="" className="mb-2 max-h-56 w-full rounded-lg bg-white object-contain" />
      )}
      <div className="flex items-center justify-between text-xs font-bold">
        <span style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
        </span>
        {market && <span className="font-extrabold text-amber">${(card as MarketCard).cost}</span>}
      </div>
      <div className="mt-1 text-base font-extrabold leading-tight text-chalk">{card.name}</div>
      <p className="mt-1 text-[13px] leading-snug text-fog">{card.description}</p>
      {!market && (card as ActionCard).evidenceCategories && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(card as ActionCard).evidenceCategories!.map((cat) => (
            <span key={cat} className="chip text-ink" style={{ background: CATEGORY_META[cat].color }}>
              {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
