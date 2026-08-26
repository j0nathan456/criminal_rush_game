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

describe('<PlayableBoard /> — busy (online action round-trip in flight)', () => {
  it('shows a syncing indicator and withholds every handler, so a click mid-request is a no-op', () => {
    const dispatch = vi.fn();
    render(<PlayableBoard state={MOCK_GAME} viewerIndex={0} dispatch={dispatch} busy />);

    expect(screen.getByText('Syncing…')).toBeInTheDocument();

    // Clicking a hand card would normally open its EventPanel (see the Tax
    // Collection test above) — with no onSelectCard handler wired up while
    // busy, it does nothing instead of queuing a second, conflicting action.
    fireEvent.click(screen.getByAltText('Tax Collection'));
    expect(screen.queryByLabelText('Event card')).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('is not shown, and handlers work normally, once the request settles', () => {
    const dispatch = vi.fn();
    render(<PlayableBoard state={MOCK_GAME} viewerIndex={0} dispatch={dispatch} busy={false} />);

    expect(screen.queryByText('Syncing…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText('Tax Collection'));
    fireEvent.click(screen.getByRole('button', { name: /Play Tax Collection/ }));
    expect(screen.getByLabelText('Event card')).toBeInTheDocument();
  });
});
