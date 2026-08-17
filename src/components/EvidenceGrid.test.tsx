import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EvidenceSlot } from '../types/game';
import type { ActionCard, EvidenceCategory } from '../types/cards';
import { EvidenceGrid } from './EvidenceGrid';

const card = (id: string, name: string): ActionCard => ({
  id, name, description: '', type: 'EVIDENCE', evidenceCategories: ['TIME', 'MEANS', 'LOCATION', 'MOTIVE'],
});

const partialGrid: Record<EvidenceCategory, EvidenceSlot> = {
  TIME: { cards: [card('c1', 'Forensic Files')] },
  MEANS: { cards: [] },
  LOCATION: { cards: [] },
  MOTIVE: { cards: [] },
};

const fullGrid: Record<EvidenceCategory, EvidenceSlot> = {
  TIME: { cards: [card('c1', 'Forensic Files')] },
  MEANS: { cards: [card('c2', 'Metal Chain')] },
  LOCATION: { cards: [card('c3', 'Bricks')] },
  MOTIVE: { cards: [card('c4', 'Power')] },
};

describe('<EvidenceGrid />', () => {
  it('renders the card name in a filled slot', () => {
    render(<EvidenceGrid grid={partialGrid} />);
    expect(screen.getByText('Forensic Files')).toBeInTheDocument();
  });

  it('lists every card that has piled up in the same category', () => {
    const stacked: Record<EvidenceCategory, EvidenceSlot> = {
      ...partialGrid,
      TIME: { cards: [card('c1', 'Forensic Files'), card('c5', 'Security Footage')] },
    };
    render(<EvidenceGrid grid={stacked} />);
    expect(screen.getByText('Forensic Files')).toBeInTheDocument();
    expect(screen.getByText('Security Footage')).toBeInTheDocument();
    expect(screen.getByText(/×2/)).toBeInTheDocument();
  });

  it('flags the grid as ready to expose only when all four categories hold a card', () => {
    const { rerender } = render(<EvidenceGrid grid={partialGrid} />);
    expect(screen.queryByText('Ready to Expose')).not.toBeInTheDocument();

    rerender(<EvidenceGrid grid={fullGrid} />);
    expect(screen.getByText('Ready to Expose')).toBeInTheDocument();
  });

  it('fires onSlotClick for any category, including an already-filled one — stacking is always allowed', () => {
    const onSlotClick = vi.fn();
    render(<EvidenceGrid grid={partialGrid} onSlotClick={onSlotClick} />);

    fireEvent.click(screen.getByText('Means').closest('button')!);
    expect(onSlotClick).toHaveBeenCalledWith('MEANS');

    onSlotClick.mockClear();
    fireEvent.click(screen.getByText('Time').closest('button')!);
    expect(onSlotClick).toHaveBeenCalledWith('TIME');
  });
});
