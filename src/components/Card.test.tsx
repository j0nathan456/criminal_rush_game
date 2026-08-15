import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActionCard, MarketCard } from '../types/cards';
import { Card } from './Card';

// A themed name with no printed art, so it renders via the CSS card path
// (with category tags) rather than as a full-face image.
const evidence: ActionCard = {
  id: 'c1', name: 'Mystery Clue', description: 'Physical evidence.',
  type: 'EVIDENCE', evidenceCategories: ['MEANS', 'LOCATION'],
};

// A synthetic name with no printed art (every real card now has a face), so it
// exercises the CSS card fallback path rather than a full-face image.
const noArtCard: MarketCard = {
  id: 'm0', name: 'Unmarked Gadget', description: 'Steal a card.',
  cost: 3, source: 'BLACK_MARKET', type: 'PERK',
};

// Hammer has printed art, so it renders full-face as an image.
const weapon: MarketCard = {
  id: 'm1', name: 'Hammer', description: '+2 power.',
  cost: 4, source: 'PUBLIC', type: 'WEAPON',
};

describe('<Card />', () => {
  it('renders an action card with its evidence category tags', () => {
    render(<Card card={evidence} />);
    expect(screen.getByText('Mystery Clue')).toBeInTheDocument();
    expect(screen.getByText(/Means/)).toBeInTheDocument();
    expect(screen.getByText(/Location/)).toBeInTheDocument();
  });

  it('renders a market card without art using the CSS card (name + cost)', () => {
    render(<Card card={noArtCard} />);
    expect(screen.getByText('Unmarked Gadget')).toBeInTheDocument();
    expect(screen.getByText('$3')).toBeInTheDocument();
  });

  it('renders a card with printed art full-face as an image', () => {
    render(<Card card={weapon} />);
    const img = screen.getByAltText('Hammer') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('cards/market/hammer.png');
  });

  it('calls onClick with the card when clicked', () => {
    const onClick = vi.fn();
    render(<Card card={weapon} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(weapon);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Card card={weapon} disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
