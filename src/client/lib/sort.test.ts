import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@shared/schemas';
import { sortResults } from './sort';

function r(id: number, distanceMeters: number, priceSek: number, start: string | null): SearchResult {
  return {
    venue: { id: 1, name: 'V', position: { lat: 0, lng: 0 } },
    service: { id: id, priceSek },
    distanceMeters,
    staff: [],
    nextAvailable: start ? { start, end: start, staffIds: [] } : null,
    days: [],
  } as unknown as SearchResult;
}

const ids = (xs: SearchResult[]) => xs.map((x) => x.service.id);

// id: distance, price, next slot
// 1: 500, 300, 10:00   2: 100, 300, none   3: 900, 100, 09:00   4: 100, 200, 11:00   5: 500, 300, none
const data = [
  r(1, 500, 300, '2026-10-23T10:00:00+02:00'),
  r(2, 100, 300, null),
  r(3, 900, 100, '2026-10-23T09:00:00+02:00'),
  r(4, 100, 200, '2026-10-23T11:00:00+02:00'),
  r(5, 500, 300, null),
];

describe('sortResults', () => {
  it('distance: asc 2,4 (100, id asc), 1,5 (500, id asc), 3; desc 3, then 1,5, then 2,4', () => {
    expect(ids(sortResults(data, 'distance', 'asc'))).toEqual([2, 4, 1, 5, 3]);
    expect(ids(sortResults(data, 'distance', 'desc'))).toEqual([3, 1, 5, 2, 4]);
  });

  it('price: asc 3 (100), 4 (200), then 300s by distance then id: 2 (100m), 1 (500m, id1), 5; desc 300s first in the same order, then 4, 3', () => {
    expect(ids(sortResults(data, 'price', 'asc'))).toEqual([3, 4, 2, 1, 5]);
    expect(ids(sortResults(data, 'price', 'desc'))).toEqual([2, 1, 5, 4, 3]);
  });

  it('earliest: asc 3 (09:00), 1 (10:00), 4 (11:00), then no slot by distance then id: 2, 5; desc 4, 1, 3, then 2, 5', () => {
    expect(ids(sortResults(data, 'earliest', 'asc'))).toEqual([3, 1, 4, 2, 5]);
    expect(ids(sortResults(data, 'earliest', 'desc'))).toEqual([4, 1, 3, 2, 5]);
  });

  it('equal values keep the same relative order in both directions', () => {
    // 1 and 5 tie on distance and price: id 1 stays before id 5 either way.
    for (const dir of ['asc', 'desc'] as const) {
      for (const key of ['distance', 'price'] as const) {
        const out = ids(sortResults(data, key, dir));
        expect(out.indexOf(1)).toBeLessThan(out.indexOf(5));
      }
    }
  });

  it('does not mutate the input', () => {
    const copy = [...data];
    sortResults(data, 'price', 'desc');
    expect(data).toEqual(copy);
    expect(ids(data)).toEqual([1, 2, 3, 4, 5]);
  });
});
