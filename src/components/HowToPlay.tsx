import { motion, AnimatePresence } from 'framer-motion';
import { HOW_TO_PLAY, RULEBOOK_TAGLINE } from '../constants/rulebook';
import { backdrop, panelIn } from '../ui/motion';

interface HowToPlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A scrollable "How to Play" overlay: a beginner-friendly summary of the rules
 * pulled from constants/rulebook. Purely presentational — open/close state is
 * owned by the caller.
 */
export function HowToPlay({ open, onClose }: HowToPlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="How to play"
          onClick={onClose}
        >
          <motion.div
            variants={panelIn}
            className="panel flex max-h-[88vh] w-full max-w-lg flex-col p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="text-2xl font-extrabold">How to Play</h2>
                <p className="mt-0.5 text-sm text-teal">{RULEBOOK_TAGLINE}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost px-3 py-1 text-lg"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {HOW_TO_PLAY.map((section) => (
                <section key={section.title}>
                  <h3 className="mb-1.5 flex items-center gap-2 text-base font-bold text-chalk">
                    <span aria-hidden="true">{section.icon}</span>
                    {section.title}
                  </h3>
                  <ul className="ml-1 list-disc space-y-1 pl-5 text-sm leading-snug text-fog marker:text-teal">
                    {section.points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <footer className="border-t border-line px-6 py-3 text-center">
              <button type="button" className="btn btn-primary px-6 py-2" onClick={onClose}>
                Got it
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
