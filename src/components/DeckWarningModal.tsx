import { motion, AnimatePresence } from 'framer-motion';
import { backdrop, panelIn } from '../ui/motion';

interface DeckWarningModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Gate for any action that would exhaust the draw pile: reshuffling the
 * discard back in scores both teams a VP (rulebook §5), so this is a
 * consequential moment worth an explicit confirm rather than firing blind.
 */
export function DeckWarningModal({ open, onConfirm, onCancel }: DeckWarningModalProps) {
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
          aria-label="Deck will run out"
          onClick={onCancel}
        >
          <motion.div
            variants={panelIn}
            className="panel w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold">Deck will run out</h2>
            <p className="mt-2 text-sm text-fog">
              The draw pile will be reshuffled from the discard, giving both teams a VP. Do you want to proceed?
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" className="btn" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={onConfirm}>
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
