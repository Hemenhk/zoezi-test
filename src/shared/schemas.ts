import { z } from 'zod';

// Zod schemas for the API contract, shared by the server and the client (CLAUDE.md rule 7).
// This file must not depend on the machine's time zone: no `new Date('YYYY-MM-DD')`.

export const MAX_RANGE_DAYS = 14;
export const DEFAULT_RADIUS_KM = 25;

/** Days since the epoch for a "YYYY-MM-DD" string, from its parts (zone independent). */
function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

const isoDate = z.iso.date();
const apiDateTime = z.iso.datetime({ offset: true });

// --- Search request (GET /api/search) ---

const searchQueryBase = z.object({
  q: z.string().trim().min(2).max(60),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  from: isoDate,
  to: isoDate,
  radiusKm: z.coerce.number().min(1).max(100).default(DEFAULT_RADIUS_KM),
});

export const searchQuerySchema = searchQueryBase.check((ctx) => {
  const { from, to } = ctx.value;
  const span = utcDay(to) - utcDay(from) + 1; // inclusive
  if (span < 1) {
    ctx.issues.push({ code: 'custom', message: '"to" must not be before "from"', path: ['to'], input: to });
  } else if (span > MAX_RANGE_DAYS) {
    ctx.issues.push({
      code: 'custom',
      message: `The range may span at most ${MAX_RANGE_DAYS} days, but it spans ${span} days`,
      path: ['to'],
      input: to,
    });
  }
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// --- Search response ---

const positionSchema = z.object({ lat: z.number(), lng: z.number() });

export const slotSchema = z.object({
  start: apiDateTime,
  end: apiDateTime,
  staffIds: z.array(z.number().int()),
});
export type SlotDto = z.infer<typeof slotSchema>;

export const serviceDtoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  durationMinutes: z.number().int(),
  priceSek: z.number(),
});

export const searchResultSchema = z.object({
  venue: z.object({ id: z.number().int(), name: z.string(), position: positionSchema }),
  service: serviceDtoSchema,
  distanceMeters: z.number().int().nonnegative(),
  staff: z.array(z.object({ id: z.number().int(), name: z.string() })),
  nextAvailable: slotSchema.nullable(),
  days: z.array(z.object({ date: isoDate, slots: z.array(slotSchema) })),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  // The query as actually applied, after clamping.
  query: searchQueryBase,
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// --- Meta (GET /api/meta) ---

export const metaResponseSchema = z.object({
  now: apiDateTime,
  timezone: z.string(),
  maxRangeDays: z.number().int(),
  defaultRadiusKm: z.number(),
  serviceNames: z.array(z.string()),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;
