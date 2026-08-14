/**
 * scripts/bots.ts — fill a Criminal Rush room with passive bot players so a
 * single human can start and play. Bots join a room, then poll its state and:
 *   - END_TURN when it is their turn, and
 *   - PASS_COMBAT for their side during the combat Power phase.
 * They make no proactive plays (no buying/attacking); they exist to fill seats
 * and keep the game flowing. Run with Node (>=22 strips the TS types):
 *
 *   node scripts/bots.ts <ROOM_CODE> [--bots 3] [--url https://criminal-rush-game.vercel.app]
 */

type Args = { code: string; bots: number; url: string };

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  let code = '';
  let bots = 3;
  let url = 'https://criminal-rush-game.vercel.app';
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--bots') bots = Number(rest[++i]);
    else if (a === '--url') url = rest[++i];
    else if (!a.startsWith('--')) code = a.toUpperCase();
  }
  if (!code) {
    console.error('Usage: node scripts/bots.ts <ROOM_CODE> [--bots N] [--url BASE]');
    process.exit(1);
  }
  return { code, bots, url };
}

type Bot = { name: string; token: string; seat: number };

async function post(url: string, path: string, payload: unknown): Promise<any> {
  const res = await fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

async function getState(url: string, code: string, token: string): Promise<any> {
  const res = await fetch(`${url}/api/state?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { code, bots: n, url } = parseArgs(process.argv);
  const names = ['Botly', 'Robo', 'Circuit', 'Gizmo', 'Widget', 'Chip', 'Cortex'];

  console.log(`Joining ${n} bot(s) to room ${code} on ${url} …`);
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) {
    const name = names[i] ?? `Bot${i + 1}`;
    const data = await post(url, '/api/join', { code, name });
    bots.push({ name, token: data.token, seat: data.view.yourSeat });
    console.log(`  ✓ ${name} joined at seat ${data.view.yourSeat}`);
  }
  console.log('Bots are in the lobby. Click "Start" in your browser when ready.\n');

  let lastLog = '';
  for (;;) {
    try {
      const view = await getState(url, code, bots[0].token);
      if (view.winner) {
        console.log(`\nGame over — ${view.winner} team wins. Bots stopping.`);
        return;
      }
      const state = view.state;
      if (!view.started || !state) {
        await sleep(1500);
        continue;
      }

      // Surface turn/combat status changes without spamming.
      const cur = state.players[state.currentPlayerIndex];
      const status = `turn: ${cur?.name}${state.combat ? ` | combat ${state.combat.phase}` : ''}`;
      if (status !== lastLog) { console.log(status); lastLog = status; }

      for (const bot of bots) {
        const botId = state.players[bot.seat]?.id;
        if (!botId) continue;
        const c = state.combat;

        // 1) Pass during the combat Power phase if this bot is a participant.
        if (c && c.phase === 'POWER') {
          if (c.attacker.playerId === botId && !c.attacker.passed) {
            await post(url, '/api/action', { code, token: bot.token, action: { type: 'PASS_COMBAT', side: 'ATTACKER' } });
            console.log(`  ${bot.name} passes combat (attacker).`);
            continue;
          }
          if (c.defender.playerId === botId && !c.defender.passed) {
            await post(url, '/api/action', { code, token: bot.token, action: { type: 'PASS_COMBAT', side: 'DEFENDER' } });
            console.log(`  ${bot.name} passes combat (defender).`);
            continue;
          }
        }

        // 2) A pending pre-combat choice we don't auto-handle — warn once.
        if (c && c.phase !== 'POWER' && c.pending?.length) {
          const head = c.pending[0];
          if (head?.playerId === botId) {
            console.warn(`  ⚠ ${bot.name} has a pending combat choice (${head.kind}) the bot can't auto-resolve.`);
          }
        }

        // 3) End our own turn (only when no combat is awaiting us).
        if (state.currentPlayerIndex === bot.seat && !c) {
          await post(url, '/api/action', { code, token: bot.token, action: { type: 'END_TURN' } });
          console.log(`  ${bot.name} ends turn.`);
        }
      }
    } catch (e) {
      console.warn('  (poll error)', (e as Error).message);
    }
    await sleep(1500);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
