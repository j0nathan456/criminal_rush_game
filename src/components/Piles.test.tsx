import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActionCard } from '../types/cards';
import { Piles } from './Piles';

const money = (id: string, value: number): ActionCard => ({ id, name: 'Profit', description: `Gain $${value}.`, type: 'MONEY', value });

describe('<Piles />', () => {
  it('shows the deck and discard counts', () => {
    render(<Piles drawPile={[money('d1', 1), money('d2', 1)]} discardPile={[money('c1', 2)]} />);
    expect(screen.getByText('Deck · 2')).toBeInTheDocument();
    expect(screen.getByText('Discard · 1')).toBeInTheDocument();
  });

  it('opens the full discard pile list when the top card is clicked, and closes it again', () => {
    const discardPile = [money('c1', 1), money('c2', 2)];
    render(<Piles drawPile={[]} discardPile={discardPile} />);

    expect(screen.queryByLabelText('Discard pile')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Profit —/));
    expect(screen.getByLabelText('Discard pile')).toBeInTheDocument();
    expect(screen.getByText('🗑️ Discard Pile (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByLabelText('Discard pile')).not.toBeInTheDocument();
  });

  it('opens the (empty) discard panel from the empty placeholder too', () => {
    render(<Piles drawPile={[]} discardPile={[]} />);
    fireEvent.click(screen.getByTitle('Click to see every discarded card'));
    expect(screen.getByText('Nothing discarded yet.')).toBeInTheDocument();
  });
});
