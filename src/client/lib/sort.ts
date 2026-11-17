import type { SearchResult } from '@shared/schemas';
import { epochOf } from './format';

export type SortKey = 'distance' | 'earliest' | 'price';
export type SortDirection = 'asc' | 'desc';

const byDistance = (a: SearchResult, b: SearchResult) =>
  a.distanceMeters - b.distanceMeters || a.service.id - b.service.id;

// Only the primary comparison flips with the direction. The tie-break is the same both ways.
// For 'earliest', results with no free time go last in both directions.
export function sortResults(
  results: readonly SearchResult[],
  key: SortKey,
  direction: SortDirection,
): SearchResult[] {
  const sign = direction === 'desc' ? -1 : 1;
  const copy = [...results];

  if (key === 'price') {
    return copy.sort((a, b) => sign * (a.service.priceSek - b.service.priceSek) || byDistance(a, b));
  }
  if (key === 'earliest') {
    // Compare instants, not strings.
    const at = (r: SearchResult) => (r.nextAvailable ? epochOf(r.nextAvailable.start) : null);
    return copy.sort((a, b) => {
      const x = at(a);
      const y = at(b);
      if (x === null || y === null) {
        if (x === y) return byDistance(a, b);
        return x === null ? 1 : -1;
      }
      return sign * (x - y) || byDistance(a, b);
    });
  }
  return copy.sort((a, b) =>
    a.distanceMeters === b.distanceMeters ? a.service.id - b.service.id : sign * (a.distanceMeters - b.distanceMeters),
  );
}
