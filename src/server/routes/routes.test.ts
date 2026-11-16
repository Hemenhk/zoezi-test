import { DateTime } from 'luxon';
import { afterAll, describe, expect, it } from 'vitest';
import { metaResponseSchema, searchResponseSchema } from '@shared/schemas';
import { buildApp } from '../app';

// Expected values come from docs/PLAN.md (API contract, "Expected slots", "Search test").

const NOW = DateTime.fromISO('2026-10-22T08:00:00+02:00', { setZone: true });
const app = buildApp({ now: () => NOW, persistPath: null });
afterAll(() => app.close());

const BASE = 'q=massage&lat=59.3143&lng=18.0736&from=2026-10-23&to=2026-10-26';

async function get(url: string) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /api/meta', () => {
  it('matches the contract', async () => {
    const { status, body } = await get('/api/meta');
    expect(status).toBe(200);
    const meta = metaResponseSchema.parse(body);
    expect(meta.now).toBe('2026-10-22T08:00:00+02:00');
    expect(meta.timezone).toBe('Europe/Stockholm');
    expect(meta.maxRangeDays).toBe(14);
    expect(meta.defaultRadiusKm).toBe(25);
  });

  it('lists unique names from searchable venues only, in Swedish order', async () => {
    const { body } = await get('/api/meta');
    const { serviceNames } = metaResponseSchema.parse(body);
    expect(serviceNames).toEqual([...serviceNames].sort(new Intl.Collator('sv').compare));
    expect(new Set(serviceNames).size).toBe(serviceNames.length);
    // Names from the plan's example (venue 4, Studio Norr, has no position and is left out).
    for (const name of ['Damklippning', 'Djupvävnadsmassage', 'Herrklippning', 'Klassisk massage', 'Massage', 'Massör - 50 min']) {
      expect(serviceNames).toContain(name);
    }
    expect(serviceNames).toHaveLength(6);
  });

  it('reads the clock on every request', async () => {
    let current = NOW;
    const moving = buildApp({ now: () => current, persistPath: null });
    const first = metaResponseSchema.parse((await moving.inject({ url: '/api/meta' })).json());
    current = NOW.plus({ hours: 3 });
    const second = metaResponseSchema.parse((await moving.inject({ url: '/api/meta' })).json());
    expect(first.now).toBe('2026-10-22T08:00:00+02:00');
    expect(second.now).toBe('2026-10-22T11:00:00+02:00');
    await moving.close();
  });
});

describe('GET /api/search', () => {
  it('returns a response that matches the contract', async () => {
    const { status, body } = await get(`/api/search?${BASE}`);
    expect(status).toBe(200);
    const res = searchResponseSchema.parse(body);
    expect(res.query).toEqual({
      q: 'massage',
      lat: 59.3143,
      lng: 18.0736,
      from: '2026-10-23',
      to: '2026-10-26',
      radiusKm: 25,
    });
    // Plan "Search test": 101, 102, 103 (venue 1), then 201 (venue 2), never 401.
    expect(res.results.map((r) => r.service.id)).toEqual([101, 102, 103, 201]);
    const first = res.results[0];
    expect(first?.nextAvailable?.start).toBe('2026-10-23T09:00:00+02:00');
    expect(first?.nextAvailable?.staffIds).toEqual([1001]);
    expect(first?.days.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('drops venue 2 with radiusKm=2', async () => {
    const { body } = await get(`/api/search?${BASE}&radiusKm=2`);
    expect(searchResponseSchema.parse(body).results.map((r) => r.service.id)).toEqual([101, 102, 103]);
  });

  const invalid: Array<[string, string]> = [
    ['q is too short', 'q=a&lat=59.3&lng=18.0&from=2026-10-23&to=2026-10-26'],
    ['lat is out of range', 'q=massage&lat=200&lng=18.0&from=2026-10-23&to=2026-10-26'],
    ['to is before from', 'q=massage&lat=59.3&lng=18.0&from=2026-10-26&to=2026-10-23'],
    ['the span is 15 days', 'q=massage&lat=59.3&lng=18.0&from=2026-10-23&to=2026-11-06'],
  ];
  it.each(invalid)('400 VALIDATION_ERROR when %s', async (_name, qs) => {
    const { status, body } = await get(`/api/search?${qs}`);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
  });

  it('puts the flattened issues in details, keyed by field', async () => {
    const { body } = await get('/api/search?q=a&lat=59.3&lng=18.0&from=2026-10-23&to=2026-10-26');
    expect(Object.keys(body.error.details.fieldErrors)).toEqual(['q']);
  });

  it('accepts a 14-day span (the boundary)', async () => {
    const { status } = await get('/api/search?q=massage&lat=59.3&lng=18.0&from=2026-10-23&to=2026-11-05');
    expect(status).toBe(200);
  });

  it('400 RANGE_IN_PAST when to is before today', async () => {
    const { status, body } = await get('/api/search?q=massage&lat=59.3&lng=18.0&from=2026-10-01&to=2026-10-01');
    expect(status).toBe(400);
    expect(body.error.code).toBe('RANGE_IN_PAST');
  });

  it('clamps a stale from to today and echoes it', async () => {
    const { status, body } = await get('/api/search?q=massage&lat=59.3&lng=18.0&from=2026-10-15&to=2026-10-23');
    expect(status).toBe(200);
    expect(searchResponseSchema.parse(body).query.from).toBe('2026-10-22');
  });
});

describe('error handling', () => {
  it('turns an unexpected error into INTERNAL_ERROR without leaking its message', async () => {
    const broken = buildApp({ persistPath: null, now: () => NOW });
    broken.get('/boom', async () => {
      throw new Error('secret internals: /Users/someone/file.ts');
    });
    const res = await broken.inject({ url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('stack');
    await broken.close();
  });

  it('uses the envelope for unknown routes', async () => {
    const { status, body } = await get('/api/nope');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
