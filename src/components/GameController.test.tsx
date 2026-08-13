import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameController } from './GameController';

const NAMES = ['Ava', 'Ben', 'Cara', 'Dev'];

function currentPlayer(): string | null {
  return document.querySelector('.cr-turn-indicator strong')?.textContent ?? null;
}

describe('<GameController /> (live game)', () => {
  it('boots a real game and renders the board', () => {
    render(<GameController playerNames={NAMES} onExit={() => {}} />);
    expect(screen.getByText('Criminal Rush')).toBeInTheDocument();
    // A Civilian starts.
    expect(NAMES).toContain(currentPlayer());
  });

  it('advances to the next player on End Turn', () => {
    render(<GameController playerNames={NAMES} onExit={() => {}} />);
    const before = currentPlayer();
    fireEvent.click(screen.getByText(/End Turn/).closest('button')!);
    expect(currentPlayer()).not.toBe(before);
  });

  it('draws a card into the current player\'s hand via the Draw action', () => {
    render(<GameController playerNames={NAMES} onExit={() => {}} />);
    const handCountText = () => document.querySelector('.cr-hand__count')?.textContent ?? '';
    const before = parseInt(handCountText(), 10);
    fireEvent.click(screen.getByText('Draw').closest('button')!);
    expect(parseInt(handCountText(), 10)).toBe(before + 1);
  });

  it('returns to the lobby via New game', () => {
    const onExit = vi.fn();
    render(<GameController playerNames={NAMES} onExit={onExit} />);
    fireEvent.click(screen.getByText('← New game'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
