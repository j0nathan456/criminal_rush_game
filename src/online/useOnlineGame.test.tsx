import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnlineGame } from './useOnlineGame.js';
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
    isHost: true,
    state: null,
    winner: null,
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
