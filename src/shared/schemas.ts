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

// --- Bookings (POST /api/bookings, GET /api/bookings/:id) ---

// D17: letters from any script (with combining marks), spaces, hyphens, apostrophes
// (straight and typographic) and periods. Only U+0020 counts as a space, so tabs, newlines
// and other control characters are rejected.
const NAME_CHARS = /^[\p{L}\p{M} .'’-]+$/u;
const HAS_LETTER = /\p{L}/u;

export const customerNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters')
  .regex(NAME_CHARS, 'Name may only contain letters, spaces, hyphens, apostrophes and periods')
  .regex(HAS_LETTER, 'Name must contain a letter');

export const createBookingSchema = z.object({
  serviceId: z.number().int().positive(),
  staffId: z.number().int().positive().nullable(),
  start: apiDateTime,
  customerName: customerNameSchema,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingSchema = z.object({
  id: z.string(),
  status: z.string(),
  customerName: z.string(),
  start: apiDateTime,
  end: apiDateTime,
  venue: z.object({ id: z.number().int(), name: z.string() }),
  service: serviceDtoSchema,
  staff: z.object({ id: z.number().int(), name: z.string() }),
  createdAt: apiDateTime,
});
export type BookingDto = z.infer<typeof bookingSchema>;

export const bookingResponseSchema = z.object({ booking: bookingSchema });
export type BookingResponse = z.infer<typeof bookingResponseSchema>;
