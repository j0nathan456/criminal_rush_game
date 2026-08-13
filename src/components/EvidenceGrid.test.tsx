import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EvidenceSlot } from '../types/game';
import type { EvidenceCategory } from '../types/cards';
import { EvidenceGrid } from './EvidenceGrid';

const partialGrid: Record<EvidenceCategory, EvidenceSlot> = {
  TIME: { isFilled: true, cardName: 'Forensic Files' },
  MEANS: { isFilled: false, cardName: null },
  LOCATION: { isFilled: false, cardName: null },
  MOTIVE: { isFilled: false, cardName: null },
};

const fullGrid: Record<EvidenceCategory, EvidenceSlot> = {
  TIME: { isFilled: true, cardName: 'Forensic Files' },
  MEANS: { isFilled: true, cardName: 'Metal Chain' },
  LOCATION: { isFilled: true, cardName: 'Bricks' },
  MOTIVE: { isFilled: true, cardName: 'Power' },
};

describe('<EvidenceGrid />', () => {
  it('renders the card name in a filled slot', () => {
    render(<EvidenceGrid grid={partialGrid} />);
    expect(screen.getByText('Forensic Files')).toBeInTheDocument();
  });

  it('flags the grid as ready to expose only when all four slots are filled', () => {
    const { rerender } = render(<EvidenceGrid grid={partialGrid} />);
    expect(screen.queryByText('Ready to Expose')).not.toBeInTheDocument();

    rerender(<EvidenceGrid grid={fullGrid} />);
    expect(screen.getByText('Ready to Expose')).toBeInTheDocument();
  });

  it('fires onSlotClick for an empty slot but not a filled one', () => {
    const onSlotClick = vi.fn();
    render(<EvidenceGrid grid={partialGrid} onSlotClick={onSlotClick} />);

    fireEvent.click(screen.getByText('Means').closest('button')!);
    expect(onSlotClick).toHaveBeenCalledWith('MEANS');

    // A filled slot's button is disabled, so clicking it does nothing.
    onSlotClick.mockClear();
    fireEvent.click(screen.getByText('Time').closest('button')!);
    expect(onSlotClick).not.toHaveBeenCalled();
  });
});
