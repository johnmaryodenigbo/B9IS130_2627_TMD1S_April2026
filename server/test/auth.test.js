import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');

let mongo;
const app = createApp();

async function loginAs(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await User.create({ name: 'Admin', email: 'admin@test.io', password: 'Admin1234', role: 'admin' });
  await User.create({ name: 'Sre', email: 'sre@test.io', password: 'Sre12345', role: 'sre' });
});

describe('auth', () => {
  it('health check is public', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'up');
  });

  it('hashes passwords and never returns them', async () => {
    const raw = await User.findOne({ email: 'admin@test.io' }).select('+password');
    assert.notEqual(raw.password, 'Admin1234');
    const agent = await loginAs('admin@test.io', 'Admin1234');
    const res = await agent.get('/api/auth/me');
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.user.role, 'admin');
  });

  it('sets an httpOnly cookie on login', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ADMIN@test.io', password: 'Admin1234' });
    assert.equal(res.status, 200);
    assert.match(res.headers['set-cookie'][0], /token=.*HttpOnly/i);
  });

  it('rejects wrong password with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.io', password: 'nope' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Invalid email or password');
  });

  it('blocks anonymous access to /me', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('logout clears the session', async () => {
    const agent = await loginAs('sre@test.io', 'Sre12345');
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('disabled users cannot log in', async () => {
    await User.updateOne({ email: 'sre@test.io' }, { isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: 'sre@test.io', password: 'Sre12345' });
    assert.equal(res.status, 403);
  });

  it('changes own password', async () => {
    const agent = await loginAs('sre@test.io', 'Sre12345');
    await agent.patch('/api/auth/me/password').send({ currentPassword: 'Sre12345', newPassword: 'NewPass999' }).expect(200);
    await loginAs('sre@test.io', 'NewPass999');
  });
});

describe('user management (RBAC)', () => {
  it('anonymous users get 401', async () => {
    await request(app).get('/api/users').expect(401);
  });

  it('SRE users get 403', async () => {
    const agent = await loginAs('sre@test.io', 'Sre12345');
    await agent.get('/api/users').expect(403);
    await agent.post('/api/users').send({ name: 'x', email: 'x@test.io', password: 'Abcd1234', role: 'admin' }).expect(403);
  });

  it('admin can create, list, update and delete users', async () => {
    const agent = await loginAs('admin@test.io', 'Admin1234');
    const created = await agent.post('/api/users').send({ name: 'New Sre', email: 'new@test.io', password: 'Abcd1234', role: 'sre' });
    assert.equal(created.status, 201);
    const id = created.body.user.id;

    const list = await agent.get('/api/users').expect(200);
    assert.equal(list.body.users.length, 3);

    const updated = await agent.patch(`/api/users/${id}`).send({ isActive: false });
    assert.equal(updated.body.user.isActive, false);

    await agent.delete(`/api/users/${id}`).expect(204);
  });

  it('validates input and rejects duplicate emails', async () => {
    const agent = await loginAs('admin@test.io', 'Admin1234');
    const bad = await agent.post('/api/users').send({ name: 'x', email: 'not-an-email', password: 'short', role: 'boss' });
    assert.equal(bad.status, 400);
    const dup = await agent.post('/api/users').send({ name: 'x', email: 'sre@test.io', password: 'Abcd1234', role: 'sre' });
    assert.equal(dup.status, 409);
  });

  it('cannot remove the last active admin or delete yourself', async () => {
    const agent = await loginAs('admin@test.io', 'Admin1234');
    const me = (await agent.get('/api/auth/me')).body.user;
    await agent.patch(`/api/users/${me.id}`).send({ role: 'sre' }).expect(400);
    await agent.patch(`/api/users/${me.id}`).send({ isActive: false }).expect(400);
    await agent.delete(`/api/users/${me.id}`).expect(400);
  });
});
