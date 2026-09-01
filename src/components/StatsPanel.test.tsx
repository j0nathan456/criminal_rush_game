import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatsPanel } from './StatsPanel';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<StatsPanel />', () => {
  it('renders nothing when closed, and fetches once opened', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_games: 10,
        avg_duration_seconds: 900,
        team_wins: { CIVILIAN: 6, CRIMINAL: 4 },
        player_count_breakdown: { '4': 7, '6': 3 },
        role_stats: [{ role_id: 'mayor', team: 'CIVILIAN', games: 10, wins: 6, win_rate: 0.6 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<StatsPanel open={false} onClose={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Game Stats', { exact: false })).not.toBeInTheDocument();

    rerender(<StatsPanel open onClose={() => {}} />);
    expect(fetchMock).toHaveBeenCalledWith('/api/stats');

    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    expect(screen.getByText('Games played')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument(); // 900s
    expect(screen.getByText('Mayor')).toBeInTheDocument();
    expect(screen.getByText('60% (10)')).toBeInTheDocument();
  });

  it('shows a friendly empty state when no games have completed yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          total_games: 0, avg_duration_seconds: null, team_wins: {}, player_count_breakdown: {}, role_stats: [],
        }),
      }),
    );
    render(<StatsPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No games completed yet/)).toBeInTheDocument());
  });

  it('shows the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Stats are not configured.' }) }),
    );
    render(<StatsPanel open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Stats are not configured.')).toBeInTheDocument());
  });
});
