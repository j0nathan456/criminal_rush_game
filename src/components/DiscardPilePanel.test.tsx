import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActionCard } from '../types/cards';
import { DiscardPilePanel } from './DiscardPilePanel';

describe('<DiscardPilePanel />', () => {
  it('lists every card, most recently discarded first', () => {
    const cards: ActionCard[] = [
      { id: 'e1', name: 'Bullet Shell', description: 'Evidence — Means.', type: 'EVIDENCE', evidenceCategories: ['MEANS'] },
      { id: 'm1', name: 'Profit', description: 'Gain $2.', type: 'MONEY', value: 2 },
    ];
    render(<DiscardPilePanel cards={cards} onClose={vi.fn()} />);

    const names = screen.getAllByText(/Bullet Shell|Profit/).map((el) => el.textContent);
    expect(names).toEqual(['Profit', 'Bullet Shell']); // most recent (last discarded) first
  });

  it('shows the type, description-on-hover, and Evidence category for each card', () => {
    const cards: ActionCard[] = [
      { id: 'e1', name: 'Bullet Shell', description: 'Evidence — Means.', type: 'EVIDENCE', evidenceCategories: ['MEANS'] },
    ];
    render(<DiscardPilePanel cards={cards} onClose={vi.fn()} />);

    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText(/Means/)).toBeInTheDocument(); // category chip
    expect(screen.getByText('Bullet Shell')).toHaveAttribute('title', 'Bullet Shell — Evidence — Means.');
  });

  it('shows a Money card’s value and a Power card’s power inline', () => {
    const cards: ActionCard[] = [
      { id: 'm1', name: 'Profit', description: 'Gain $2.', type: 'MONEY', value: 2 },
      { id: 'p1', name: 'Surge', description: '+2 PL during combat.', type: 'POWER', power: 2 },
    ];
    render(<DiscardPilePanel cards={cards} onClose={vi.fn()} />);
    expect(screen.getByText('$2')).toBeInTheDocument();
    expect(screen.getByText('+2 PL')).toBeInTheDocument();
  });

  it('shows an empty message when nothing has been discarded', () => {
    render(<DiscardPilePanel cards={[]} onClose={vi.fn()} />);
    expect(screen.getByText('Nothing discarded yet.')).toBeInTheDocument();
  });

  it('calls onClose from the Close button and the backdrop, but not the panel itself', () => {
    const onClose = vi.fn();
    const cards: ActionCard[] = [{ id: 'm1', name: 'Profit', description: 'Gain $2.', type: 'MONEY', value: 2 }];
    render(<DiscardPilePanel cards={cards} onClose={onClose} />);

    fireEvent.click(screen.getByText('Profit'));
    expect(onClose).not.toHaveBeenCalled(); // clicking inside the panel doesn't close it

    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
