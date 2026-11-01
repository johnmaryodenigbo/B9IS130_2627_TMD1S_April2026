// Unit tests for the HTTP checker and status rules. No database needed.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { performCheck } from '../src/services/checker.js';
import { nextState } from '../src/services/statusRules.js';

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') return res.end('fine');
    if (req.url === '/error') { res.statusCode = 500; return res.end('boom'); }
    if (req.url === '/redirect') { res.writeHead(301, { location: '/ok' }); return res.end(); }
    if (req.url === '/slow') return setTimeout(() => res.end('late'), 2000);
    if (req.url === '/method') return res.end(req.method);
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));

describe('performCheck', () => {
  it('is ok when the status matches', async () => {
    const r = await performCheck({ url: `${base}/ok`, expectedStatus: 200, timeoutMs: 1000 });
    assert.equal(r.ok, true);
    assert.equal(r.statusCode, 200);
    assert.equal(typeof r.responseTimeMs, 'number');
    assert.equal(r.error, undefined);
  });

  it('fails when the status does not match', async () => {
    const r = await performCheck({ url: `${base}/error`, expectedStatus: 200, timeoutMs: 1000 });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 500);
    assert.match(r.error, /Expected status 200, got 500/);
  });

  it('can expect a non-200 status', async () => {
    const r = await performCheck({ url: `${base}/error`, expectedStatus: 500, timeoutMs: 1000 });
    assert.equal(r.ok, true);
  });

  it('follows redirects normally, but not when a 3xx is expected', async () => {
    const followed = await performCheck({ url: `${base}/redirect`, expectedStatus: 200, timeoutMs: 1000 });
    assert.equal(followed.statusCode, 200);
    const manual = await performCheck({ url: `${base}/redirect`, expectedStatus: 301, timeoutMs: 1000 });
    assert.equal(manual.ok, true);
    assert.equal(manual.statusCode, 301);
  });

  it('times out', async () => {
    const r = await performCheck({ url: `${base}/slow`, expectedStatus: 200, timeoutMs: 300 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'Timed out after 0.3s');
    assert.equal(r.statusCode, undefined);
  });

  it('reports connection errors clearly', async () => {
    // Grab a free port, then close it so nothing is listening there.
    const tmp = http.createServer();
    await new Promise((r) => tmp.listen(0, '127.0.0.1', r));
    const { port } = tmp.address();
    await new Promise((r) => tmp.close(r));
    const r = await performCheck({ url: `http://127.0.0.1:${port}/`, expectedStatus: 200, timeoutMs: 1000 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'Connection refused');
  });

  it('uses the configured method', async () => {
    const r = await performCheck({ url: `${base}/method`, method: 'HEAD', expectedStatus: 200, timeoutMs: 1000 });
    assert.equal(r.ok, true);
  });
});

describe('nextState', () => {
  it('a success always means up and resets failures', () => {
    assert.deepEqual(nextState({ status: 'down', consecutiveFailures: 5 }, true, 2), { status: 'up', consecutiveFailures: 0 });
    assert.deepEqual(nextState({ status: 'pending' }, true, 2), { status: 'up', consecutiveFailures: 0 });
  });

  it('one failure below the threshold keeps the current status', () => {
    assert.deepEqual(nextState({ status: 'up', consecutiveFailures: 0 }, false, 2), { status: 'up', consecutiveFailures: 1 });
    assert.deepEqual(nextState({ status: 'pending', consecutiveFailures: 0 }, false, 2), { status: 'pending', consecutiveFailures: 1 });
  });

  it('reaching the threshold marks it down', () => {
    assert.deepEqual(nextState({ status: 'up', consecutiveFailures: 1 }, false, 2), { status: 'down', consecutiveFailures: 2 });
    assert.deepEqual(nextState({ status: 'down', consecutiveFailures: 2 }, false, 2), { status: 'down', consecutiveFailures: 3 });
  });

  it('threshold 1 marks down on the first failure', () => {
    assert.deepEqual(nextState({ status: 'up' }, false, 1), { status: 'down', consecutiveFailures: 1 });
  });
});
