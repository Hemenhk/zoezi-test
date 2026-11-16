import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { searchQuerySchema, searchResponseSchema, type SearchQuery } from '@shared/schemas';
import { DATA_PATH } from '../config';
import { loadData } from '../data/load';
import { BookingStore } from '../data/store';
import { matchesService, normalize, search, SearchError } from './search';

// Expected values come from docs/PLAN.md (D8-D12, Q1, Q9, "Search test").

const NOW = DateTime.fromISO('2026-10-22T08:00:00+02:00', { setZone: true });
const model = loadData(DATA_PATH);
const store = new BookingStore(model.bookings, null);
const MEDBORGARPLATSEN = { lat: 59.3143, lng: 18.0736 };

function query(over: Partial<SearchQuery> = {}): SearchQuery {
  return { q: 'massage', ...MEDBORGARPLATSEN, from: '2026-10-23', to: '2026-10-26', radiusKm: 25, ...over };
}

describe('normalize', () => {
  it('lowercases, strips diacritics and collapses whitespace', () => {
    expect(normalize('Djupvävnadsmassage')).toBe('djupvavnadsmassage');
    expect(normalize('Massör')).toBe('massor');
    expect(normalize('  Klassisk   MASSAGE ')).toBe('klassisk massage');
  });
});

describe('matching', () => {
  const ids = (q: string) =>
    [...model.serviceById.values()].filter(({ service }) => matchesService(q, service.name)).map(({ service }) => service.id);

  it('"massage" matches every massage service, via substring and synonym', () => {
    expect(ids('massage').sort()).toEqual([101, 102, 103, 201, 401]);
  });
  it('is diacritic and case insensitive', () => {
    expect(ids('djupvavnadsmassage')).toEqual([103]);
    expect(ids('HERR')).toEqual([301]);
  });
  it('requires every token', () => {
    expect(ids('klassisk massage')).toEqual([101]);
  });
  it('matches nothing for an unknown word', () => {
    expect(ids('xyz')).toEqual([]);
  });
  it('applies the haircut synonyms', () => {
    expect(ids('frisör').sort()).toEqual([301, 302]);
  });
  it('does not expand partial tokens through synonyms ("ma" only matches by substring)', () => {
    expect(ids('ma').sort()).toEqual([101, 102, 103, 201, 401]);
    expect(ids('mass').sort()).toEqual([101, 102, 103, 201, 401]);
  });
});

describe('search from Medborgarplatsen', () => {
  it('returns 101, 102, 103 (venue 1), then 201, and never 401 (Q1)', () => {
    const { results } = search(query(), model, store, NOW);
    expect(results.map((r) => r.service.id)).toEqual([101, 102, 103, 201]);
    expect(results.map((r) => r.venue.id)).toEqual([1, 1, 1, 2]);
  });
  it('reports distances in whole metres: ~1.0 km and ~3.5 km', () => {
    const { results } = search(query(), model, store, NOW);
    const [first, , , last] = results;
    expect(Number.isInteger(first?.distanceMeters)).toBe(true);
    expect(Math.abs((first?.distanceMeters ?? 0) - 1026)).toBeLessThan(30);
    expect(Math.abs((last?.distanceMeters ?? 0) - 3500)).toBeLessThan(300);
  });
  it('drops venue 2 with radiusKm = 2', () => {
    const { results } = search(query({ radiusKm: 2 }), model, store, NOW);
    expect(results.map((r) => r.service.id)).toEqual([101, 102, 103]);
  });
  it('sets nextAvailable to the first slot, with API ISO strings', () => {
    const { results } = search(query(), model, store, NOW);
    const r101 = results.find((r) => r.service.id === 101);
    expect(r101?.nextAvailable).toEqual({
      start: '2026-10-23T09:00:00+02:00',
      end: '2026-10-23T10:00:00+02:00',
      staffIds: [1001],
    });
    expect(r101?.staff.map((s) => s.id)).toEqual([1001, 1002]);
  });
  it('lists every day in the range, including closed ones', () => {
    const { results } = search(query(), model, store, NOW);
    const r101 = results.find((r) => r.service.id === 101);
    expect(r101?.days.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
    expect(r101?.days[2]?.slots).toEqual([]); // Sunday: closed
  });
  it('returns a fully booked result with nextAvailable null (D12)', () => {
    // Venue 1 is closed on Sunday 25 Oct.
    const { results } = search(query({ from: '2026-10-25', to: '2026-10-25' }), model, store, NOW);
    expect(results.map((r) => r.service.id)).toEqual([101, 102, 103, 201]);
    const r101 = results.find((r) => r.service.id === 101);
    expect(r101?.nextAvailable).toBeNull();
  });
  it('produces a body that matches the contract schema', () => {
    expect(() => searchResponseSchema.parse(search(query(), model, store, NOW))).not.toThrow();
  });
});

describe('range clamping (D8)', () => {
  it('clamps a past "from" to today', () => {
    const { query: applied, results } = search(query({ from: '2026-10-01' }), model, store, NOW);
    expect(applied.from).toBe('2026-10-22');
    expect(results[0]?.days[0]?.date).toBe('2026-10-22');
  });
  it('throws RANGE_IN_PAST when "to" is before today', () => {
    const run = () => search(query({ from: '2026-10-01', to: '2026-10-01' }), model, store, NOW);
    expect(run).toThrow(SearchError);
    expect(run).toThrow(expect.objectContaining({ code: 'RANGE_IN_PAST' }));
  });
  it('accepts "to" equal to today', () => {
    expect(() => search(query({ from: '2026-10-22', to: '2026-10-22' }), model, store, NOW)).not.toThrow();
  });
});

describe('searchQuerySchema', () => {
  const base = { q: 'massage', lat: '59.3143', lng: '18.0736', from: '2026-10-23', to: '2026-10-26' };

  it('coerces query-string numbers and defaults the radius to 25', () => {
    const parsed = searchQuerySchema.parse(base);
    expect(parsed).toMatchObject({ lat: 59.3143, lng: 18.0736, radiusKm: 25 });
  });
  it('counts the span inclusively: 23 → 26 is 4 days, 23 → 05 Nov is 14 days (ok), 15 days is not', () => {
    expect(searchQuerySchema.safeParse({ ...base, to: '2026-11-05' }).success).toBe(true);
    const r = searchQuerySchema.safeParse({ ...base, to: '2026-11-06' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain('15 days');
  });
  it('rejects to before from', () => {
    const r = searchQuerySchema.safeParse({ ...base, from: '2026-10-26', to: '2026-10-23' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['to']);
  });
  it('rejects a query that is too short or too long, after trimming', () => {
    expect(searchQuerySchema.safeParse({ ...base, q: 'a' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ ...base, q: ' a ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ ...base, q: 'x'.repeat(61) }).success).toBe(false);
  });
  it('rejects out-of-range coordinates and radius', () => {
    expect(searchQuerySchema.safeParse({ ...base, lat: '91' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ ...base, lng: '-181' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ ...base, radiusKm: '101' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ ...base, radiusKm: '0' }).success).toBe(false);
  });
  it('rejects impossible dates', () => {
    expect(searchQuerySchema.safeParse({ ...base, from: '2026-02-30' }).success).toBe(false);
  });
});
