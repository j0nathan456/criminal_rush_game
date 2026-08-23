import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnlineGame, isRematchResetWithoutUs } from './useOnlineGame.js';
import type { RoomView } from './protocol.js';

const STORAGE_KEY = 'criminal-rush:online';

/** jsdom here ships without localStorage, so install a minimal in-memory shim. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

function fakeView(over: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABCD',
    started: false,
    seats: [{ seat: 0, name: 'Ava' }],
    yourSeat: 0,
    yourPlayerIndex: -1,
    isHost: true,
    state: null,
    winner: null,
    chatEnabled: false,
    chat: [],
    ...over,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => handler(url, init),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: new MemStorage(),
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

describe('useOnlineGame — session persistence', () => {
  it('saves the session to localStorage after creating a room', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => ({ code: 'WXYZ', token: 'tok-1', view: fakeView({ code: 'WXYZ' }) })),
    );

    const { result, unmount } = renderHook(() => useOnlineGame());
    await act(async () => {
      await result.current.createRoom('Ava');
    });

    expect(result.current.view?.code).toBe('WXYZ');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ code: 'WXYZ', token: 'tok-1' });
    unmount();
  });

  it('clears the session on leave', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ({ code: 'WXYZ', token: 'tok-1', view: fakeView() })));
    const { result, unmount } = renderHook(() => useOnlineGame());
    await act(async () => {
      await result.current.createRoom('Ava');
    });
    act(() => result.current.leave());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.view).toBeNull();
    unmount();
  });

  it('reconnects from a saved session on mount', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: 'RJON', token: 'tok-9' }));
    const fetchSpy = mockFetch(() => fakeView({ code: 'RJON', started: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const { result, unmount } = renderHook(() => useOnlineGame());
    await waitFor(() => expect(result.current.view?.code).toBe('RJON'));

    const calledUrl = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
    expect(calledUrl).toContain('code=RJON');
    unmount();
  });

  it('drops a stale session when the room is gone (404)', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: 'GONE', token: 't' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'No room' }) })) as unknown as typeof fetch,
    );

    const { result, unmount } = renderHook(() => useOnlineGame());
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(result.current.view).toBeNull();
    unmount();
  });
});

describe('useOnlineGame — out-of-order responses', () => {
  it("a request issued first but resolving last never clobbers a later request's response (e.g. a slow poll landing after a dispatch)", async () => {
    // First call (started as turn 1) resolves slowly; second call (started
    // as turn 2) resolves fast. On a flaky connection the network can
    // reorder these — the hook must keep whichever was *issued* last, not
    // whichever *arrived* last, or a stale response can regress the visible
    // game state (e.g. showing "your turn" again after it's already moved on).
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        const mine = call;
        const view = fakeView({ code: 'ABCD', started: true, seats: [{ seat: 0, name: `turn-${mine}` }] });
        const delayMs = mine === 1 ? 40 : 0; // first-issued call resolves last
        await new Promise((r) => setTimeout(r, delayMs));
        return { ok: true, status: 200, json: async () => ({ view }) };
      }) as unknown as typeof fetch,
    );

    const { result, unmount } = renderHook(() => useOnlineGame());
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = result.current.dispatch({ type: 'DRAW_CARD' });
    });
    act(() => {
      second = result.current.dispatch({ type: 'DRAW_CARD' });
    });
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(result.current.view?.seats[0].name).toBe('turn-2');
    unmount();
  });
});

describe('isRematchResetWithoutUs', () => {
  it("is true when the view we're about to lose our seat in was a finished (winner-decided) game", () => {
    const justEnded = fakeView({ started: true, winner: 'CIVILIAN' });
    expect(isRematchResetWithoutUs(justEnded)).toBe(true);
  });

  it('is false for a genuine pre-game kick — not started, no winner to have ended', () => {
    const preGame = fakeView({ started: false, winner: null });
    expect(isRematchResetWithoutUs(preGame)).toBe(false);
  });

  it('is false for a live game with no winner yet — should never lose our seat mid-game anyway', () => {
    const midGame = fakeView({ started: true, winner: null });
    expect(isRematchResetWithoutUs(midGame)).toBe(false);
  });

  it('is false when there was no previous view at all (cold start)', () => {
    expect(isRematchResetWithoutUs(null)).toBe(false);
  });
});
