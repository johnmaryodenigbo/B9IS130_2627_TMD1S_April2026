import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downEmail, recoveredEmail, testEmail, formatDuration } from '../src/services/emailTemplates.js';

const monitor = { name: 'Payments <API>', environment: 'production', method: 'GET', url: 'https://api.example.com/health', lastError: 'Connection refused' };
const appUrl = 'https://zops.example.com';

describe('email templates', () => {
  it('formats durations', () => {
    assert.equal(formatDuration(42_000), '42 s');
    assert.equal(formatDuration(754_000), '12 min 34 s');
    assert.equal(formatDuration(7_380_000), '2 h 3 min');
    assert.equal(formatDuration(3 * 86_400_000 + 3_600_000), '3 d 1 h');
  });

  it('DOWN email has the key facts and escapes HTML', () => {
    const incident = { startedAt: new Date(Date.now() - 60_000), cause: 'Connection refused' };
    const mail = downEmail({ monitor, incident, check: { error: 'Timed out after 10s' }, appUrl });
    assert.equal(mail.subject, '[ZOps] DOWN: Payments <API> (production)');
    assert.match(mail.text, /Error: Timed out after 10s/);
    assert.match(mail.text, /GET https:\/\/api\.example\.com\/health/);
    assert.match(mail.text, /https:\/\/zops\.example\.com\/on-call/);
    assert.match(mail.html, /Payments &lt;API&gt;/);
    assert.doesNotMatch(mail.html, /Payments <API>/);
  });

  it('reminder email says how long it has been down', () => {
    const incident = { startedAt: new Date(Date.now() - 90 * 60_000) };
    const mail = downEmail({ monitor, incident, appUrl, reminder: true });
    assert.match(mail.subject, /STILL DOWN: Payments <API> \(production\) — 1 h 30 min/);
    assert.match(mail.text, /acknowledges/);
  });

  it('RECOVERED email includes total downtime', () => {
    const startedAt = new Date('2026-10-30T10:00:00Z');
    const incident = { startedAt, resolvedAt: new Date('2026-10-30T10:12:34Z'), cause: 'Connection refused', acknowledgedBy: { name: 'Sre' } };
    const mail = recoveredEmail({ monitor, incident, appUrl });
    assert.equal(mail.subject, '[ZOps] RECOVERED: Payments <API> (production) after 12 min 34 s');
    assert.match(mail.text, /Total downtime: 12 min 34 s/);
    assert.match(mail.text, /Acknowledged by: Sre/);
  });

  it('test email names the recipient', () => {
    const mail = testEmail({ user: { name: 'Johnmary', email: 'j@example.com' }, appUrl });
    assert.equal(mail.subject, '[ZOps] Test email');
    assert.match(mail.text, /Johnmary <j@example\.com>/);
  });
});
