/**
 * src/online/useOnlineGame.ts
 *
 * Client hook for online play. Talks to the /api routes, holds the local
 * player's token + code, and polls /api/state for the authoritative (redacted)
 * view. All game logic lives on the server; this just relays actions.
 *
 * The session (code + token) is persisted to localStorage so a page refresh
 * automatically rejoins the same seat instead of losing it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction } from '../engine/index.js';
import type { RoomView } from './protocol.js';

const POLL_MS = 1500;
const STORAGE_KEY = 'criminal-rush:online';

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable (private mode etc.) — reconnect just won't work */
  }
}

function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function stateUrl(code: string, token: string | null): string {
  return `/api/state?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token ?? '')}`;
}

/**
 * `/api/state` never 404s for a token the room no longer recognizes — it
 * just comes back with `yourSeat: -1` (see viewFor). That's how a kicked
 * player finds out: their own poll returns a view that no longer includes
 * them. Only meaningful pre-game — once started, seats are frozen.
 */
function wasRemoved(v: RoomView): boolean {
  return !v.started && v.yourSeat === -1;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface OnlineGame {
  view: RoomView | null;
  error: string | null;
  connecting: boolean;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => Promise<void>;
  start: () => Promise<void>;
  /** Host-only: remove another not-yet-started player by their lobby seat. */
  kick: (targetSeat: number) => Promise<void>;
  /** Host-only, pre-game: turn the room's chat on or off. */
  setChatEnabled: (enabled: boolean) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  leave: () => void;
}

export function useOnlineGame(): OnlineGame {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const codeRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setConnecting(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const enter = (code: string, token: string, v: RoomView) => {
    codeRef.current = code;
    tokenRef.current = token;
    saveSession({ code, token });
    setView(v);
  };

  const createRoom = useCallback(
    (name: string) =>
      run(async () => {
        const { code, token, view: v } = await postJson<{ code: string; token: string; view: RoomView }>(
          '/api/create',
          { name },
        );
        enter(code, token, v);
      }),
    [run],
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      run(async () => {
        const normalized = code.trim().toUpperCase();
        const { token, view: v } = await postJson<{ token: string; view: RoomView }>('/api/join', {
          code: normalized,
          name,
        });
        enter(normalized, token, v);
      }),
    [run],
  );

  const start = useCallback(
    () =>
      run(async () => {
        const { view: v } = await postJson<{ view: RoomView }>('/api/start', {
          code: codeRef.current,
          token: tokenRef.current,
        });
        setView(v);
      }),
    [run],
  );

  const kick = useCallback(
    (targetSeat: number) =>
      run(async () => {
        const { view: v } = await postJson<{ view: RoomView }>('/api/kick', {
          code: codeRef.current,
          token: tokenRef.current,
          targetSeat,
        });
        setView(v);
      }),
    [run],
  );

  const setChatEnabled = useCallback(
    (enabled: boolean) =>
      run(async () => {
        const { view: v } = await postJson<{ view: RoomView }>('/api/chat-toggle', {
          code: codeRef.current,
          token: tokenRef.current,
          enabled,
        });
        setView(v);
      }),
    [run],
  );

  const sendChat = useCallback(
    (text: string) =>
      run(async () => {
        const { view: v } = await postJson<{ view: RoomView }>('/api/chat-send', {
          code: codeRef.current,
          token: tokenRef.current,
          text,
        });
        setView(v);
      }),
    [run],
  );

  const dispatch = useCallback(
    (action: GameAction) =>
      run(async () => {
        const { view: v } = await postJson<{ view: RoomView }>('/api/action', {
          code: codeRef.current,
          token: tokenRef.current,
          action,
        });
        setView(v);
      }),
    [run],
  );

  const leave = useCallback(() => {
    const code = codeRef.current;
    const token = tokenRef.current;
    // Best-effort: release the seat server-side (frees pre-game rooms).
    if (code && token) {
      void fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, token }),
      }).catch(() => {
        /* ignore — the room will expire on its own */
      });
    }
    codeRef.current = null;
    tokenRef.current = null;
    clearSession();
    setView(null);
    setError(null);
  }, []);

  // Restore a saved session on mount (survives page refresh).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const session = loadSession();
    if (!session) return;

    codeRef.current = session.code;
    tokenRef.current = session.token;
    let cancelled = false;
    fetch(stateUrl(session.code, session.token))
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          // Room expired or was closed — drop the stale session.
          leave();
          return;
        }
        if (!res.ok) return;
        const v = (await res.json()) as RoomView;
        if (wasRemoved(v)) {
          leave();
          return;
        }
        setView(v);
      })
      .catch(() => {
        /* offline — keep the session and let the poll retry */
      });
    return () => {
      cancelled = true;
    };
  }, [leave]);

  // Poll for updates while in a room.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const tick = async () => {
      const code = codeRef.current;
      if (!code) return;
      try {
        const res = await fetch(stateUrl(code, tokenRef.current));
        if (cancelled) return;
        if (res.status === 404) {
          clearSession();
          codeRef.current = null;
          tokenRef.current = null;
          setView(null);
          setError('The room was closed.');
          return;
        }
        if (!res.ok) return;
        const v = (await res.json()) as RoomView;
        if (wasRemoved(v)) {
          clearSession();
          codeRef.current = null;
          tokenRef.current = null;
          setView(null);
          setError('You were removed from the room by the host.');
          return;
        }
        setView(v);
      } catch {
        /* transient network error — keep the last view and retry next tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view]);

  return { view, error, connecting, createRoom, joinRoom, start, kick, setChatEnabled, sendChat, dispatch, leave };
}
