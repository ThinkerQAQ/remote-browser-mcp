import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersionProbe} from '../scripts/lib/cdp-probe.mjs';
class Socket extends EventTarget {
  readyState = 0;
  sent = [];
  constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  send(data) {
    const request = JSON.parse(data); this.sent.push(request);
    if (this.respond === false) return;
    queueMicrotask(() => {
      const event = new Event('message'); event.data = JSON.stringify({id: request.id, result: {product: 'TestBrowser'}}); this.dispatchEvent(event);
    });
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
test('status calls share one socket and concurrent calls share one version request', async () => {
  const sockets = []; const probe = createVersionProbe(() => { const s = new Socket(); sockets.push(s); return s; });
  const first = probe('ws://localhost'); const concurrent = probe('ws://localhost');
  assert.equal(first, concurrent);
  assert.deepEqual(await first, {cdp_ready: true});
  assert.deepEqual(await probe('ws://localhost'), {cdp_ready: true});
  assert.equal(sockets.length, 1); assert.equal(sockets[0].sent.length, 2);
  assert.notEqual(sockets[0].sent[0].id, sockets[0].sent[1].id);
  assert.equal(sockets[0].readyState, 1);
  sockets[0].close();
  assert.deepEqual(await probe('ws://localhost'), {cdp_ready: true});
  assert.equal(sockets.length, 2); sockets[1].close();
});
test('timeout retires an unresponsive connection and allows recovery', async () => {
  let attempts = 0;
  const probe = createVersionProbe(() => { const s = new Socket(); if (++attempts === 1) s.respond = false; return s; });
  assert.deepEqual(await probe('ws://localhost', 15), {cdp_ready: false});
  assert.deepEqual(await probe('ws://localhost'), {cdp_ready: true});
  assert.equal(attempts, 2);
});
