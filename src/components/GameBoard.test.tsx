import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameBoard } from './GameBoard';
import { MOCK_GAME } from '../mocks/mockGame';

describe('<GameBoard />', () => {
  it('renders the brand, the current player, and every player in the roster', () => {
    render(<GameBoard state={MOCK_GAME} />);

    expect(screen.getByText('Criminal Rush')).toBeInTheDocument();
    // Ava is the current player (index 0) — the prominent active-player banner
    // names her (default viewer == current player, so it reads "Your turn").
    const banner = screen.getByLabelText('Active player');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Ava/);

    // Players live behind a button now; open the roster to reveal each one.
    fireEvent.click(screen.getByText(/Players · Roles/).closest('button')!);
    for (const p of MOCK_GAME.players) {
      expect(screen.getAllByText(new RegExp(p.name)).length).toBeGreaterThan(0);
    }
  });

  it('always shows the Black Market regardless of the viewer team', () => {
    // The board renders both the table layout and the stacked fallback (CSS
    // toggles visibility), so the Black Market appears in more than one place.

    // Viewer 0 (Ava) is a Civilian → Black Market still visible (observe-only).
    const { rerender } = render(<GameBoard state={MOCK_GAME} viewerIndex={0} />);
    expect(screen.getAllByText('Black Market').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/you can observe/i).length).toBeGreaterThan(0);

    // Viewer 1 (Ben) is a Criminal → Black Market visible for them too.
    rerender(<GameBoard state={MOCK_GAME} viewerIndex={1} />);
    expect(screen.getAllByText('Black Market').length).toBeGreaterThan(0);
  });

  it('only shows the chat box once the host has enabled it', () => {
    const { rerender } = render(<GameBoard state={MOCK_GAME} />);
    expect(screen.queryByLabelText('Chat')).not.toBeInTheDocument();

    rerender(<GameBoard state={MOCK_GAME} chatEnabled chat={[]} />);
    expect(screen.getByLabelText('Chat')).toBeInTheDocument();
  });
});
