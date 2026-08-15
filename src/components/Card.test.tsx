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

// Signal Jammer has no printed art, so it renders via the CSS card path.
const noArtWeapon: MarketCard = {
  id: 'm0', name: 'Signal Jammer', description: '+2 power.',
  cost: 5, source: 'PUBLIC', type: 'WEAPON',
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
    render(<Card card={noArtWeapon} />);
    expect(screen.getByText('Signal Jammer')).toBeInTheDocument();
    expect(screen.getByText('$5')).toBeInTheDocument();
  });

  it('renders every card as a text card (no printed art image)', () => {
    render(<Card card={weapon} />);
    // Cards are text-only now: name + cost show, and there is no <img>.
    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.getByText('$4')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
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
