import { Check } from '../models/Check.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Percentage with 2 decimals, or null when there are no checks yet.
const percent = (ok, total) => (total ? Math.round((ok / total) * 10000) / 100 : null);

/**
 * Uptime % over the last 24 hours, 7 days and 30 days for each monitor.
 * @param {import('mongoose').Types.ObjectId[]} monitorIds
 * @returns {Promise<Map<string, { day: number|null, week: number|null, month: number|null }>>}
 */
export async function getUptimeStats(monitorIds) {
  const now = Date.now();
  const day = new Date(now - DAY_MS);
  const week = new Date(now - 7 * DAY_MS);
  const month = new Date(now - 30 * DAY_MS);

  const inWindow = (since) => ({ $gte: ['$checkedAt', since] });
  const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

  const rows = await Check.aggregate([
    { $match: { monitor: { $in: monitorIds }, checkedAt: { $gte: month } } },
    {
      $group: {
        _id: '$monitor',
        monthTotal: { $sum: 1 },
        monthOk: countIf('$ok'),
        weekTotal: countIf(inWindow(week)),
        weekOk: countIf({ $and: ['$ok', inWindow(week)] }),
        dayTotal: countIf(inWindow(day)),
        dayOk: countIf({ $and: ['$ok', inWindow(day)] }),
      },
    },
  ]);

  return new Map(
    rows.map((r) => [
      r._id.toString(),
      { day: percent(r.dayOk, r.dayTotal), week: percent(r.weekOk, r.weekTotal), month: percent(r.monthOk, r.monthTotal) },
    ])
  );
}

/**
 * Daily uptime % for the last `days` days (UTC), oldest first — for the dashboard bars.
 * Days without checks are null.
 * @returns {Promise<Map<string, { date: string, uptime: number|null }[]>>}
 */
export async function getDailyHistory(monitorIds, days = 30) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (days - 1) * DAY_MS);

  const rows = await Check.aggregate([
    { $match: { monitor: { $in: monitorIds }, checkedAt: { $gte: start } } },
    {
      $group: {
        _id: { monitor: '$monitor', date: { $dateToString: { format: '%Y-%m-%d', date: '$checkedAt' } } },
        total: { $sum: 1 },
        ok: { $sum: { $cond: ['$ok', 1, 0] } },
      },
    },
  ]);

  const byKey = new Map(rows.map((r) => [`${r._id.monitor}|${r._id.date}`, percent(r.ok, r.total)]));
  const dates = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10));

  return new Map(
    monitorIds.map((id) => [
      id.toString(),
      dates.map((date) => ({ date, uptime: byKey.get(`${id}|${date}`) ?? null })),
    ])
  );
}

export const EMPTY_UPTIME = { day: null, week: null, month: null };
