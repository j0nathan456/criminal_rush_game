import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lobby } from './Lobby';

function fillSeats(names: string[]) {
  const inputs = screen.getAllByRole('textbox');
  names.forEach((name, i) => fireEvent.change(inputs[i], { target: { value: name } }));
}

describe('<Lobby />', () => {
  it('starts with 4 seats and Start disabled until all are named', () => {
    render(<Lobby onStart={() => {}} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(4);

    const start = screen.getByText('Start Game');
    expect(start).toBeDisabled();

    fillSeats(['Ava', 'Ben', 'Cara', 'Dev']);
    expect(start).not.toBeDisabled();
  });

  it('adds a seat with "Add player"', () => {
    render(<Lobby onStart={() => {}} />);
    fireEvent.click(screen.getByText('+ Add player'));
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
  });

  it('calls onStart with the trimmed names', () => {
    const onStart = vi.fn();
    render(<Lobby onStart={onStart} />);
    fillSeats(['  Ava ', 'Ben', 'Cara', 'Dev']);
    fireEvent.click(screen.getByText('Start Game'));
    expect(onStart).toHaveBeenCalledWith(['Ava', 'Ben', 'Cara', 'Dev']);
  });
});
