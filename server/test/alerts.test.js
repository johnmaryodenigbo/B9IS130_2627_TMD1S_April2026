// Integration tests for incidents and alert emails (needs mongodb-memory-server).
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'zops-test';
process.env.MAIL_TRANSPORT = 'memory';
process.env.ALERT_COOLDOWN_MINUTES = '5';
process.env.ALERT_REMINDER_MINUTES = '60';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Monitor } = await import('../src/models/Monitor.js');
const { Incident } = await import('../src/models/Incident.js');
const { outbox } = await import('../src/services/mailer.js');
const alerts = await import('../src/services/alerts.js');

let mongo;
const app = createApp();
const quiet = { log() {}, error() {} };
const down = (monitor, error = 'Connection refused') =>
  alerts.handleStatusChange({ monitor: { ...monitor.toObject(), status: 'down', statusChangedAt: new Date() }, from: 'up', to: 'down', check: { ok: false, error } }, quiet);
const up = (monitor) =>
  alerts.handleStatusChange({ monitor: { ...monitor.toObject(), status: 'up' }, from: 'down', to: 'up', check: { ok: true } }, quiet);

async function loginAs(email, password) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Incident.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let monitor;
beforeEach(async () => {
  outbox.length = 0;
  await Promise.all([User.deleteMany({}), Monitor.deleteMany({}), Incident.deleteMany({})]);
  await User.create({ name: 'Admin', email: 'admin@zubby.com', password: 'Admin1234', role: 'admin' });
  await User.create({ name: 'Sre One', email: 'sre1@zubby.com', password: 'Sre12345', role: 'sre' });
  await User.create({ name: 'Sre Two', email: 'sre2@zubby.com', password: 'Sre12345', role: 'sre', onCall: false });
  monitor = await Monitor.create({ name: 'Payments API', url: 'https://example.com/health', status: 'up' });
});

describe('alerts', () => {
  it('DOWN opens an incident and emails on-call SREs only', async () => {
    await down(monitor);
    const incident = await Incident.findOne({ monitor: monitor._id });
    assert.equal(incident.status, 'open');
    assert.equal(incident.cause, 'Connection refused');
    assert.equal(outbox.length, 1);
    assert.deepEqual(outbox[0].to, ['sre1@zubby.com']);
    assert.match(outbox[0].subject, /DOWN: Payments API \(production\)/);
    assert.equal(incident.notifications[0].ok, true);
  });

  it('UP resolves the incident and sends a recovery email', async () => {
    await down(monitor);
    await up(monitor);
    const incident = await Incident.findOne({ monitor: monitor._id });
    assert.equal(incident.status, 'resolved');
    assert.equal(incident.resolution, 'recovered');
    assert.ok(incident.durationMs >= 0);
    assert.equal(outbox.length, 2);
    assert.match(outbox[1].subject, /RECOVERED: Payments API/);
  });

  it('never opens two incidents for the same outage', async () => {
    await Promise.all([down(monitor), down(monitor)]);
    assert.equal(await Incident.countDocuments({ status: 'open' }), 1);
    assert.equal(outbox.length, 1);
  });

  it('stays quiet when a monitor flaps within the cooldown', async () => {
    await down(monitor);
    await up(monitor);
    await down(monitor); // down again right away
    const latest = await Incident.findOne({ status: 'open' });
    assert.equal(latest.alertsSuppressed, true);
    await up(monitor);
    assert.equal(outbox.length, 2, 'only the first DOWN + RECOVERED were emailed');
  });

  it('falls back to admins when no SRE is on call', async () => {
    await User.updateMany({ role: 'sre' }, { onCall: false });
    await down(monitor);
    assert.deepEqual(outbox[0].to, ['admin@test.io']);
    const incident = await Incident.findOne();
    assert.match(incident.notifications[0].error, /sent to admins instead/);
  });

  it('sends reminders until the incident is acknowledged', async () => {
    await down(monitor);
    // pretend the last email was 61 minutes ago
    await Incident.updateOne({}, { lastNotifiedAt: new Date(Date.now() - 61 * 60_000) });
    assert.equal(await alerts.sendDueReminders(quiet), 1);
    assert.match(outbox[1].subject, /STILL DOWN/);
    assert.equal(await alerts.sendDueReminders(quiet), 0, 'not again straight away');

    await Incident.updateOne({}, { lastNotifiedAt: new Date(Date.now() - 61 * 60_000), acknowledgedAt: new Date() });
    assert.equal(await alerts.sendDueReminders(quiet), 0, 'acknowledged incidents get no reminders');
  });

  it('pausing a down monitor closes its incident without emailing', async () => {
    await down(monitor);
    await alerts.handleMonitorSaved({ monitor: { ...monitor.toObject(), status: 'paused' } }, quiet);
    const incident = await Incident.findOne();
    assert.equal(incident.status, 'resolved');
    assert.equal(incident.resolution, 'paused');
    assert.equal(outbox.length, 1);
  });
});

describe('incident & alert API', () => {
  it('SRE can list and acknowledge incidents', async () => {
    await down(monitor);
    const sre = await loginAs('sre1@zubby.com', 'Sre12345');
    const list = await sre.get('/api/incidents?status=open').expect(200);
    assert.equal(list.body.incidents.length, 1);
    const ack = await sre.post(`/api/incidents/${list.body.incidents[0].id}/acknowledge`).expect(200);
    assert.equal(ack.body.incident.acknowledgedBy.name, 'Sre One');
  });

  it('anonymous users cannot see incident details', async () => {
    await request(app).get('/api/incidents').expect(401);
  });

  it('public incidents hide the cause', async () => {
    await down(monitor);
    const res = await request(app).get('/api/public/incidents').expect(200);
    assert.equal(res.body.incidents.length, 1);
    assert.equal(res.body.incidents[0].monitorName, 'Payments API');
    assert.equal(res.body.incidents[0].cause, undefined);
  });

  it('test email goes to the logged-in user', async () => {
    const sre = await loginAs('sre1@zubby.com', 'Sre12345');
    const res = await sre.post('/api/alerts/test').expect(200);
    assert.equal(res.body.to, 'sre1@zubby.com');
    assert.equal(outbox[0].subject, '[ZOps] Test email');
  });

  it('SRE can switch their own alerts off; admin can see recipients', async () => {
    const sre = await loginAs('sre1@zubby.com', 'Sre12345');
    const res = await sre.patch('/api/auth/me').send({ onCall: false }).expect(200);
    assert.equal(res.body.user.onCall, false);
    const admin = await loginAs('admin@test.io', 'Admin1234');
    const r = await admin.get('/api/alerts/recipients').expect(200);
    assert.deepEqual(r.body, { recipients: ['admin@test.io'], fallback: true, transport: 'memory' });
  });
});
