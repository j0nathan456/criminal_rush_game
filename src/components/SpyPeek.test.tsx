import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ActionCard } from '../types/cards';
import { SpyPeek } from './SpyPeek';

describe('<SpyPeek />', () => {
  it("shows the peeked card's name and a Recon label", () => {
    const card: ActionCard = { id: 'c1', name: 'Forensic Files', description: '', type: 'EVIDENCE', evidenceCategories: ['MEANS'] };
    render(<SpyPeek card={card} />);
    expect(screen.getByAltText('Forensic Files')).toBeInTheDocument();
    expect(screen.getByText(/Recon/)).toBeInTheDocument();
  });
});
