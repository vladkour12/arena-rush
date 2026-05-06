// End-to-end smoke test: create a practice room, open WS, JOIN_MATCH,
// confirm we receive MATCH_START and at least 5 SNAP messages within 3 seconds.
import WebSocket from 'ws';

const HOST = 'http://127.0.0.1:3001';
const WS_URL = 'ws://127.0.0.1:3001';

async function main() {
  const playerId = 'smoke-' + Math.random().toString(36).slice(2, 8);
  const r = await fetch(`${HOST}/api/shooter/practice`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hostId: playerId, hostName: 'Smoke', difficulty: 'easy' }),
  });
  if (!r.ok) throw new Error('practice create failed: ' + r.status);
  const { code } = await r.json();
  console.log('Created practice room:', code);

  const ws = new WebSocket(WS_URL);
  let matchStartReceived = false;
  let snapCount = 0;
  let killReceived = false;

  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'JOIN_MATCH', code, playerId, name: 'Smoke' }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.t === 'MATCH_START') {
      matchStartReceived = true;
      console.log('MATCH_START received');
    }
    if (msg.t === 'SNAP') snapCount++;
    if (msg.t === 'KILL') {
      killReceived = true;
      console.log('KILL received:', msg.killer, '->', msg.victim);
    }
  });

  // Send some inputs so the player moves and shoots
  let seq = 0;
  const inputInterval = setInterval(() => {
    if (ws.readyState !== 1) return;
    seq++;
    ws.send(JSON.stringify({
      t: 'INPUT', seq,
      mv: { x: 1, y: 0 }, aim: 0, fire: true, swap: false, reload: false,
    }));
  }, 33);

  await new Promise(r => setTimeout(r, 4000));
  clearInterval(inputInterval);
  ws.send(JSON.stringify({ t: 'LEAVE_MATCH', code }));
  ws.close();

  console.log(`SNAP received: ${snapCount}`);
  console.log(`MATCH_START received: ${matchStartReceived}`);
  console.log(`KILL received: ${killReceived}`);
  if (!matchStartReceived) { console.error('FAIL: no MATCH_START'); process.exit(1); }
  if (snapCount < 30)      { console.error('FAIL: too few SNAPs (expected ≥30 over 4s @ 20Hz)'); process.exit(1); }
  console.log('SMOKE TEST PASSED');
  process.exit(0);
}

main().catch(e => { console.error('SMOKE ERROR:', e); process.exit(1); });
