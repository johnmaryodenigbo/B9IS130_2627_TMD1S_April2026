// Integration tests for the monitoring worker (needs mongodb-memory-server).
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.FAILURE_THRESHOLD = '2';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Monitor } = await import('../src/models/Monitor.js');
const { Check } = await import('../src/models/Check.js');
const { createScheduler } = await import('../src/worker/scheduler.js');
const { monitorEvents } = await import('../src/services/events.js');

let mongo;
let target;      // fake application being monitored
let targetUrl;
let healthy = true;
const app = createApp();
const quiet = { log() {}, error() {} };

async function loginAs(email, password) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}

// Runs one scheduler pass and waits for its checks to finish.
async function runWorkerOnce() {
  const scheduler = createScheduler({ tickMs: 60_000, concurrency: 5, logger: quiet });
  scheduler.start();
  await scheduler.idle();
  await scheduler.stop();
}

// Makes every monitor due again (instead of waiting for its interval).
const makeDue = () => Monitor.updateMany({}, { nextCheckAt: new Date(Date.now() - 1000) });

before(async () => {
  target = http.createServer((_req, res) => { res.statusCode = healthy ? 200 : 503; res.end(); });
  await new Promise((r) => target.listen(0, '127.0.0.1', r));
  targetUrl = `http://127.0.0.1:${target.address().port}/health`;

  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Monitor.init(), Check.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  target.closeAllConnections();
  await new Promise((r) => target.close(r));
});

beforeEach(async () => {
  healthy = true;
  await Promise.all([User.deleteMany({}), Monitor.deleteMany({}), Check.deleteMany({})]);
  await User.create({ name: 'Admin', email: 'admin@test.io', password: 'Admin1234', role: 'admin' });
  await User.create({ name: 'Sre', email: 'sre@test.io', password: 'Sre12345', role: 'sre' });
});

describe('monitoring worker', () => {
  it('checks due monitors and marks them up', async () => {
    await Monitor.create({ name: 'App', url: targetUrl });
    await runWorkerOnce();

    const m = await Monitor.findOne({ name: 'App' });
    assert.equal(m.status, 'up');
    assert.equal(m.lastStatusCode, 200);
    assert.ok(m.lastCheckedAt);
    assert.ok(m.nextCheckAt > new Date(), 'next check is scheduled in the future');
    assert.equal(await Check.countDocuments({ monitor: m._id }), 1);
  });

  it('does not check a monitor again before its interval', async () => {
    await Monitor.create({ name: 'App', url: targetUrl, intervalSeconds: 60 });
    await runWorkerOnce();
    await runWorkerOnce();
    assert.equal(await Check.countDocuments(), 1);
  });

  it('skips paused monitors', async () => {
    await Monitor.create({ name: 'Paused', url: targetUrl, isActive: false, status: 'paused' });
    await runWorkerOnce();
    assert.equal(await Check.countDocuments(), 0);
  });

  it('marks down only after FAILURE_THRESHOLD failures, then recovers', async () => {
    const events = [];
    const listener = (e) => events.push(`${e.from}->${e.to}`);
    monitorEvents.on('status-change', listener);

    await Monitor.create({ name: 'App', url: targetUrl });
    await runWorkerOnce(); // up
    healthy = false;

    await makeDue(); await runWorkerOnce();
    assert.equal((await Monitor.findOne()).status, 'up', 'one failure is not enough');

    await makeDue(); await runWorkerOnce();
    const down = await Monitor.findOne();
    assert.equal(down.status, 'down');
    assert.equal(down.consecutiveFailures, 2);
    assert.match(down.lastError, /got 503/);

    healthy = true;
    await makeDue(); await runWorkerOnce();
    assert.equal((await Monitor.findOne()).status, 'up');

    monitorEvents.off('status-change', listener);
    assert.deepEqual(events, ['pending->up', 'up->down', 'down->up']);
  });

  it('never checks the same monitor twice when two workers run at once', async () => {
    await Monitor.create({ name: 'App', url: targetUrl });
    const a = createScheduler({ tickMs: 60_000, logger: quiet });
    const b = createScheduler({ tickMs: 60_000, logger: quiet });
    a.start(); b.start();
    await Promise.all([a.idle(), b.idle()]);
    await Promise.all([a.stop(), b.stop()]);
    assert.equal(await Check.countDocuments(), 1);
  });
});

describe('check & uptime API', () => {
  it('check now runs a check and returns the result (admin and SRE)', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl });
    const sre = await loginAs('sre@test.io', 'Sre12345');
    const res = await sre.post(`/api/monitors/${m.id}/check`).expect(200);
    assert.equal(res.body.check.ok, true);
    assert.equal(res.body.monitor.status, 'up');
    assert.equal(res.body.monitor.uptime.day, 100);
  });

  it('check now refuses paused monitors', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl, isActive: false, status: 'paused' });
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.post(`/api/monitors/${m.id}/check`).expect(400);
  });

  it('lists check history newest first', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl });
    await Check.create([
      { monitor: m._id, ok: true, checkedAt: new Date(Date.now() - 60_000) },
      { monitor: m._id, ok: false, checkedAt: new Date() },
    ]);
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const res = await admin.get(`/api/monitors/${m.id}/checks`).expect(200);
    assert.deepEqual(res.body.checks.map((c) => c.ok), [false, true]);
  });

  it('calculates uptime % in the monitor list', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl });
    const hour = 3600_000;
    await Check.create([
      { monitor: m._id, ok: true, checkedAt: new Date(Date.now() - hour) },
      { monitor: m._id, ok: true, checkedAt: new Date(Date.now() - 2 * hour) },
      { monitor: m._id, ok: true, checkedAt: new Date(Date.now() - 3 * hour) },
      { monitor: m._id, ok: false, checkedAt: new Date(Date.now() - 4 * hour) },
      { monitor: m._id, ok: false, checkedAt: new Date(Date.now() - 3 * 24 * hour) },
    ]);
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const res = await admin.get('/api/monitors').expect(200);
    assert.deepEqual(res.body.monitors[0].uptime, { day: 75, week: 60, month: 60 });
  });

  it('public endpoint includes uptime and 30 days of history', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl });
    await Check.create({ monitor: m._id, ok: true });
    const res = await request(app).get('/api/public/monitors').expect(200);
    const pub = res.body.monitors[0];
    assert.equal(pub.uptime.day, 100);
    assert.equal(pub.history.length, 30);
    assert.equal(pub.history.at(-1).uptime, 100);
    assert.equal(pub.url, undefined);
  });

  it('deleting a monitor deletes its checks', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl });
    await Check.create({ monitor: m._id, ok: true });
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.delete(`/api/monitors/${m.id}`).expect(204);
    assert.equal(await Check.countDocuments(), 0);
  });

  it('resuming a monitor schedules an immediate check', async () => {
    const m = await Monitor.create({ name: 'App', url: targetUrl, isActive: false, status: 'paused', nextCheckAt: new Date(Date.now() + 3600_000) });
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.patch(`/api/monitors/${m.id}`).send({ isActive: true }).expect(200);
    const updated = await Monitor.findById(m.id);
    assert.ok(updated.nextCheckAt <= new Date());
    assert.equal(updated.status, 'pending');
  });
});
