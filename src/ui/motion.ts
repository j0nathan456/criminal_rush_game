/**
 * src/ui/motion.ts
 *
 * Shared Framer Motion variants + springs so motion feels consistent across
 * the app. "Polished" tier: meaningful, quick, not distracting.
 */
import type { Transition, Variants } from 'framer-motion';

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 32 };
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 26 };

/** Panels / dialogs springing into place. */
export const panelIn: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: softSpring },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } },
};

/** Overlay / modal backdrop fade. */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** A staggered list container. */
export const stagger: Variants = {
  show: { transition: { staggerChildren: 0.045 } },
};

/** A card/item rising into a staggered list. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
};

/** Hover/press feedback for interactive cards. */
export const cardHover = {
  whileHover: { y: -6, transition: spring },
  whileTap: { scale: 0.97 },
};
