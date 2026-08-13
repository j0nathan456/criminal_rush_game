#!/usr/bin/env node
/**
 * scripts/online-smoke.mjs
 *
 * End-to-end smoke test for the online API. Walks a full room lifecycle against
 * a running server and checks turn authority + per-player redaction.
 *
 *   node scripts/online-smoke.mjs [baseUrl]
 *
 * baseUrl defaults to http://localhost:3000 (the `vercel dev` default) and can
 * also be set via the BASE_URL env var, or pointed at a deployed URL.
 *
 * IMPORTANT: needs a shared store, so run it against either
 *   (a) a deployment with Upstash/KV connected, or
 *   (b) `vercel dev` after `vercel env pull .env.local`.
 * The in-memory fallback is per-function-process and is NOT shared across the
 * separate /api endpoints, so this test will not pass without Redis.
 */

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(method, path, payload) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data.error ?? text}`);
  }
  return data;
}

const getState = (code, token) =>
  api('GET', `/api/state?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);

async function main() {
  console.log(`Online smoke test → ${BASE}\n`);

  // 1. Create + join to 4 seats.
  console.log('Lobby: create + join');
  const host = await api('POST', '/api/create', { name: 'Ava' });
  check('create returns a code + token', Boolean(host.code && host.token), JSON.stringify(host));
  const code = host.code;
  const tokens = [host.token];
  for (const name of ['Ben', 'Cara', 'Dev']) {
    const j = await api('POST', '/api/join', { code, name });
    tokens.push(j.token);
  }
  let view = await getState(code, host.token);
  check('4 players are seated', view.seats.length === 4, `seats=${view.seats.length}`);

  // 2. Leave frees a seat pre-game.
  console.log('Lobby: leave releases a seat');
  const eve = await api('POST', '/api/join', { code, name: 'Eve' });
  view = await getState(code, host.token);
  check('Eve joined (5 seats)', view.seats.length === 5);
  await api('POST', '/api/leave', { code, token: eve.token });
  view = await getState(code, host.token);
  check('Eve left (back to 4 seats)', view.seats.length === 4, `seats=${view.seats.length}`);
  check('seats stay contiguous after leave', view.seats.every((s, i) => s.seat === i));

  // 3. Start (host only).
  console.log('Start');
  let nonHostRejected = false;
  try {
    await api('POST', '/api/start', { code, token: tokens[1] });
  } catch {
    nonHostRejected = true;
  }
  check('non-host cannot start', nonHostRejected);
  const started = await api('POST', '/api/start', { code, token: host.token });
  check('host starts the game', started.view.started === true);
  check('game has 4 players', started.view.state?.players?.length === 4);

  // 4. Redaction: each player sees only their own hand; draw pile hidden.
  console.log('Redaction');
  view = await getState(code, host.token);
  const me = view.state.players[view.yourSeat];
  const others = view.state.players.filter((_, i) => i !== view.yourSeat);
  check('own hand is visible', me.hand.some((c) => c.name !== 'Hidden') || me.hand.length === 0);
  check("other players' hands are hidden", others.every((p) => p.hand.every((c) => c.name === 'Hidden')));
  check('draw pile is hidden', view.state.drawPile.every((c) => c.name === 'Hidden'));

  // 5. Turn authority + a real action.
  console.log('Action');
  const currentSeat = view.state.currentPlayerIndex;
  const currentToken = tokens[currentSeat];
  const before = view.state.players[currentSeat].hand.length;

  let wrongTurnRejected = false;
  try {
    await api('POST', '/api/action', { code, token: tokens[(currentSeat + 1) % 4], action: { type: 'DRAW_CARD' } });
  } catch {
    wrongTurnRejected = true;
  }
  check('out-of-turn action is rejected', wrongTurnRejected);

  const acted = await api('POST', '/api/action', { code, token: currentToken, action: { type: 'DRAW_CARD' } });
  const after = acted.view.state.players[currentSeat].hand.length;
  check('current player drew a card', after === before + 1, `before=${before} after=${after}`);

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nSmoke test could not run: ${err.message}`);
  console.error('Is the server up? Try: vercel dev  (with Upstash/KV env configured)');
  process.exit(1);
});
