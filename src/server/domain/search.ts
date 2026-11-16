import { DateTime } from 'luxon';
import type { DataModel, Position, Service, Venue } from '../data/load';
import type { BookingStore } from '../data/store';
import type { SearchQuery, SearchResponse, SearchResult, SlotDto } from '@shared/schemas';
import { computeSlots, type Slot } from './availability';
import { haversineMeters } from './geo';
import { localDateString, toApiIso, ZONE } from './time';

/** Lowercase, strip diacritics (NFD, combining marks removed), collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// D9. Groups of normalised words that stand for each other. A query token is expanded
// only when it equals a group member exactly, so "ma" or "mass" are not expanded and
// can't pull in unrelated services through a synonym.
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['massage', 'massor', 'massos'],
  ['klippning', 'frisor', 'haircut'],
];

function variants(token: string): string[] {
  const group = SYNONYM_GROUPS.find((g) => g.includes(token));
  return group ? [...group] : [token];
}

/** True if every query token, or a synonym of it, is a substring of the service name. */
export function matchesService(query: string, serviceName: string): boolean {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  const name = normalize(serviceName);
  return tokens.every((t) => variants(t).some((v) => name.includes(v)));
}

export class SearchError extends Error {
  constructor(
    readonly code: 'RANGE_IN_PAST',
    message: string,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

const toSlotDto = (s: Slot): SlotDto => ({
  start: toApiIso(s.start),
  end: toApiIso(s.end),
  staffIds: s.staffIds,
});

/** Start of a local calendar day in epoch milliseconds, so dates compare as numbers. */
function dayMs(date: string): number {
  return DateTime.fromISO(date, { zone: ZONE }).startOf('day').toMillis();
}

export function search(query: SearchQuery, model: DataModel, store: BookingStore, now: DateTime): SearchResponse {
  const today = localDateString(now);
  if (dayMs(query.to) < dayMs(today)) {
    throw new SearchError('RANGE_IN_PAST', `The date range ends before today (${today})`);
  }
  // D8: a stale "from" is clamped to today.
  const from = dayMs(query.from) < dayMs(today) ? today : query.from;
  const origin = { lat: query.lat, lng: query.lng };

  const hits: Array<{ venue: Venue; position: Position; service: Service; distance: number }> = [];
  for (const venue of model.venues) {
    // Q1/D10: no position, no honest distance, so the venue is not searchable.
    if (!venue.position) continue;
    const position = venue.position;
    const distance = haversineMeters(origin, position);
    if (distance > query.radiusKm * 1000) continue;
    for (const service of venue.services) {
      if (matchesService(query.q, service.name)) hits.push({ venue, position, service, distance });
    }
  }
  hits.sort((a, b) => a.distance - b.distance || a.service.id - b.service.id);

  const results: SearchResult[] = hits.map(({ venue, position, service, distance }) => {
    const days = computeSlots({
      venue,
      service,
      staff: venue.staff,
      bookingsByStaff: (id) => store.listForStaff(id),
      now,
      fromDate: from,
      toDate: query.to,
    }).map((d) => ({ date: d.date, slots: d.slots.map(toSlotDto) }));
    const next = days.flatMap((d) => d.slots)[0] ?? null; // D12: null when fully booked
    return {
      venue: { id: venue.id, name: venue.name, position },
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceSek: service.priceSek,
      },
      distanceMeters: Math.round(distance),
      staff: venue.staff.filter((s) => s.serviceIds.includes(service.id)).map((s) => ({ id: s.id, name: s.name })),
      nextAvailable: next,
      days,
    };
  });

  return { query: { ...query, from }, results };
}
