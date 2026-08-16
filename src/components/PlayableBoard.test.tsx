import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlayableBoard } from './PlayableBoard';
import { MOCK_GAME } from '../mocks/mockGame';

describe('<PlayableBoard /> — playing an Event card end to end', () => {
  it('Tax Collection: select the card, play it, pick an opponent, and dispatch the tax', () => {
    const dispatch = vi.fn();
    render(<PlayableBoard state={MOCK_GAME} viewerIndex={0} dispatch={dispatch} />);

    // Tax Collection has printed art, so it renders as an image button, not text.
    fireEvent.click(screen.getByAltText('Tax Collection'));
    fireEvent.click(screen.getByRole('button', { name: /Play Tax Collection/ }));

    // The EventPanel should now prompt for an opponent — Ben and Dev (Criminals),
    // not Cara (Ava's fellow Civilian). Names also appear in the Roster, so
    // scope everything to the panel itself.
    const panel = within(screen.getByLabelText('Event card'));
    expect(panel.getByText(/Choose an opponent with \$1 or more/i)).toBeInTheDocument();
    expect(panel.getByText('Ben')).toBeInTheDocument();
    expect(panel.getByText('Dev')).toBeInTheDocument();
    expect(panel.queryByText('Cara')).not.toBeInTheDocument();

    fireEvent.click(panel.getByText('Ben'));
    fireEvent.click(panel.getByRole('button', { name: /Play Tax Collection/ }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'PLAY_CARD',
      cardId: 'c5',
      targetId: 'p1',
      options: { marketCardId: undefined, inventoryCardId: undefined, takePerk: undefined, discardMarketIds: [] },
    });
  });
});
