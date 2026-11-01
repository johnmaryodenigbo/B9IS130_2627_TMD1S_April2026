// Socket.IO tests. No database: the user lookup is stubbed.
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { io as connect } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { initRealtime } = await import('../src/realtime/socket.js');
const { monitorEvents } = await import('../src/services/events.js');
const { User } = await import('../src/models/User.js');

const users = {
  sre: { _id: new mongoose.Types.ObjectId(), name: 'Sre', role: 'sre', isActive: true },
  disabled: { _id: new mongoose.Types.ObjectId(), name: 'Old', role: 'sre', isActive: false },
};
mock.method(User, 'findById', (id) => ({
  lean: async () => Object.values(users).find((u) => String(u._id) === String(id)) ?? null,
}));

let server;
let realtime;
let url;
const sockets = [];

const tokenFor = (user) => jwt.sign({ sub: String(user._id), role: user.role }, 'test-secret');

// Connects like a browser: optional auth cookie, waits for the server's hello.
async function client(user) {
  const socket = connect(url, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: user ? { cookie: `token=${tokenFor(user)}` } : {},
    forceNew: true,
  });
  sockets.push(socket);
  const hello = await new Promise((resolve, reject) => {
    socket.once('hello', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, hello };
}

// Resolves with the next `event` payload, or null if none arrives in time.
const next = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off(event, handler); resolve(null); }, ms);
    const handler = (data) => { clearTimeout(timer); resolve(data); };
    socket.once(event, handler);
  });

const monitor = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: 'Payments API',
  url: 'https://secret.internal/health',
  environment: 'production',
  status: 'up',
  isPublic: true,
  lastError: 'internal detail',
  lastResponseTimeMs: 120,
  ...overrides,
});

before(async () => {
  server = http.createServer();
  realtime = initRealtime(server, { logger: {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  await realtime.close();
});

describe('realtime', () => {
  it('anonymous and logged-in sockets are told who they are', async () => {
    assert.deepEqual((await client()).hello, { authenticated: false, role: null });
    assert.deepEqual((await client(users.sre)).hello, { authenticated: true, role: 'sre' });
    assert.equal((await client(users.disabled)).hello.authenticated, false, 'disabled users are anonymous');
  });

  it('anonymous viewers get a public view without URLs or errors', async () => {
    const { socket } = await client();
    const m = monitor();
    const got = next(socket, 'monitor:update');
    monitorEvents.emit('checked', { monitor: m });
    const data = await got;
    assert.equal(data.id, String(m._id));
    assert.equal(data.status, 'up');
    assert.equal(data.lastResponseTimeMs, 120);
    assert.equal(data.url, undefined);
    assert.equal(data.lastError, undefined);
  });

  it('staff get the full monitor exactly once', async () => {
    const { socket } = await client(users.sre);
    let count = 0;
    socket.on('monitor:update', () => count++);
    const m = monitor();
    const got = next(socket, 'monitor:update');
    monitorEvents.emit('checked', { monitor: m });
    const data = await got;
    assert.equal(data.url, 'https://secret.internal/health');
    assert.equal(data.id, String(m._id));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(count, 1, 'not duplicated by the public room');
  });

  it('private monitors are never sent to anonymous viewers', async () => {
    const anon = (await client()).socket;
    const staff = (await client(users.sre)).socket;
    const m = monitor({ isPublic: false });
    const anonUpdate = next(anon, 'monitor:update');
    const anonRemoved = next(anon, 'monitor:removed');
    const staffUpdate = next(staff, 'monitor:update');
    monitorEvents.emit('monitor-saved', { monitor: m });
    assert.equal(await anonUpdate, null);
    assert.deepEqual(await anonRemoved, { id: String(m._id) });
    assert.equal((await staffUpdate).name, 'Payments API');
  });

  it('broadcasts status changes', async () => {
    const anon = (await client()).socket;
    const staff = (await client(users.sre)).socket;
    const m = monitor({ status: 'down' });
    const a = next(anon, 'monitor:status');
    const s = next(staff, 'monitor:status');
    monitorEvents.emit('status-change', { monitor: m, from: 'up', to: 'down', check: { ok: false, error: 'Connection refused' } });
    const [pub, priv] = await Promise.all([a, s]);
    assert.equal(pub.to, 'down');
    assert.equal(pub.check, undefined, 'anonymous viewers do not get check details');
    assert.equal(priv.check.error, 'Connection refused');
  });

  it('tells everyone when a monitor is deleted', async () => {
    const anon = (await client()).socket;
    const got = next(anon, 'monitor:removed');
    monitorEvents.emit('monitor-deleted', { id: 'abc', isPublic: true });
    assert.deepEqual(await got, { id: 'abc' });
  });
});
