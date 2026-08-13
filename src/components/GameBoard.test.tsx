import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameBoard } from './GameBoard';
import { MOCK_GAME } from '../mocks/mockGame';

describe('<GameBoard />', () => {
  it('renders the brand, the current player, and every seat', () => {
    render(<GameBoard state={MOCK_GAME} />);

    expect(screen.getByText('Criminal Rush')).toBeInTheDocument();
    // Ava is the current player (index 0) — she appears in the turn indicator.
    expect(screen.getByText(/Current turn:/)).toBeInTheDocument();

    // All four players have a seat.
    for (const p of MOCK_GAME.players) {
      expect(screen.getAllByText(new RegExp(p.name)).length).toBeGreaterThan(0);
    }
  });

  it('shows the Black Market only when the viewer is a Criminal', () => {
    // Viewer 0 (Ava) is a Civilian → no Black Market.
    const { rerender } = render(<GameBoard state={MOCK_GAME} viewerIndex={0} />);
    expect(screen.queryByText('Black Market')).not.toBeInTheDocument();

    // Viewer 1 (Ben) is a Criminal → Black Market visible.
    rerender(<GameBoard state={MOCK_GAME} viewerIndex={1} />);
    expect(screen.getByText('Black Market')).toBeInTheDocument();
  });
});
