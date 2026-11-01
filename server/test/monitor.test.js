import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Monitor } = await import('../src/models/Monitor.js');

let mongo;
const app = createApp();
const sample = { name: 'Payments API', url: 'https://example.com/health', environment: 'production' };

async function loginAs(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Monitor.init(); // make sure the unique index exists
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Monitor.deleteMany({})]);
  await User.create({ name: 'Admin', email: 'admin@test.io', password: 'Admin1234', role: 'admin' });
  await User.create({ name: 'Sre', email: 'sre@test.io', password: 'Sre12345', role: 'sre' });
});

describe('monitor inventory', () => {
  it('admin can create a monitor with sensible defaults', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const res = await admin.post('/api/monitors').send(sample);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const m = res.body.monitor;
    assert.equal(m.method, 'GET');
    assert.equal(m.expectedStatus, 200);
    assert.equal(m.intervalSeconds, 60);
    assert.equal(m.status, 'pending');
    assert.equal(m.isActive, true);
  });

  it('rejects bad input', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.post('/api/monitors').send({ name: 'x', url: 'ftp://example.com' }).expect(400);
    await admin.post('/api/monitors').send({ ...sample, intervalSeconds: 5 }).expect(400);
    // timeout (30s) must be shorter than the interval (30s)
    await admin.post('/api/monitors').send({ ...sample, intervalSeconds: 30, timeoutMs: 30000 }).expect(400);
  });

  it('allows the same name in a different environment only', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.post('/api/monitors').send(sample).expect(201);
    await admin.post('/api/monitors').send(sample).expect(409);
    await admin.post('/api/monitors').send({ ...sample, environment: 'staging' }).expect(201);
  });

  it('pausing and resuming updates the status', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const { body } = await admin.post('/api/monitors').send(sample);
    const paused = await admin.patch(`/api/monitors/${body.monitor.id}`).send({ isActive: false });
    assert.equal(paused.body.monitor.status, 'paused');
    const resumed = await admin.patch(`/api/monitors/${body.monitor.id}`).send({ isActive: true });
    assert.equal(resumed.body.monitor.status, 'pending');
  });

  it('admin can update and delete', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const { body } = await admin.post('/api/monitors').send(sample);
    const upd = await admin.patch(`/api/monitors/${body.monitor.id}`).send({ intervalSeconds: 300 });
    assert.equal(upd.body.monitor.intervalSeconds, 300);
    await admin.delete(`/api/monitors/${body.monitor.id}`).expect(204);
    await admin.get(`/api/monitors/${body.monitor.id}`).expect(404);
  });

  it('SRE can view but not change the inventory', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const { body } = await admin.post('/api/monitors').send(sample);
    const sre = await loginAs('sre@test.io', 'Sre12345');
    const list = await sre.get('/api/monitors').expect(200);
    assert.equal(list.body.monitors.length, 1);
    await sre.post('/api/monitors').send({ ...sample, name: 'Other' }).expect(403);
    await sre.patch(`/api/monitors/${body.monitor.id}`).send({ isActive: false }).expect(403);
    await sre.delete(`/api/monitors/${body.monitor.id}`).expect(403);
  });

  it('anonymous users cannot use the admin API', async () => {
    await request(app).get('/api/monitors').expect(401);
  });

  it('public endpoint lists only public monitors and hides URLs', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.post('/api/monitors').send(sample).expect(201);
    await admin.post('/api/monitors').send({ ...sample, name: 'Internal DB', isPublic: false }).expect(201);
    const res = await request(app).get('/api/public/monitors').expect(200);
    assert.equal(res.body.monitors.length, 1);
    assert.equal(res.body.monitors[0].name, 'Payments API');
    assert.equal(res.body.monitors[0].url, undefined);
  });

  it('filters by environment and search text', async () => {
    const admin = await loginAs('admin@test.io', 'Admin1234');
    await admin.post('/api/monitors').send(sample);
    await admin.post('/api/monitors').send({ ...sample, name: 'Website', environment: 'staging' });
    const env = await admin.get('/api/monitors?environment=staging');
    assert.deepEqual(env.body.monitors.map((m) => m.name), ['Website']);
    const q = await admin.get('/api/monitors?q=pay');
    assert.deepEqual(q.body.monitors.map((m) => m.name), ['Payments API']);
  });
});
