import { readFileSync } from 'node:fs';
import type { DateTime } from 'luxon';
import type { z } from 'zod';
import {
  localDateString,
  localDateTime,
  parseInstant,
  weekdayKey,
} from '../domain/time';
import {
  rawBookingSchema,
  rawFileSchema,
  rawServiceSchema,
  rawStaffSchema,
  rawVenueSchema,
  type Position,
  type Service,
  type Staff,
  type WeekHours,
} from './schema';

export type { Position, Service, Staff, WeekHours } from './schema';

export interface Venue {
  id: number;
  name: string;
  /** null when data.json has no position (Q1). */
  position: Position | null;
  openingHours: WeekHours;
  services: Service[];
  staff: Staff[];
}

export interface Booking {
  id: string;
  staffId: number;
  serviceId: number;
  start: DateTime;
  end: DateTime;
  /** Epoch milliseconds. Intervals are compared with these, never with strings. */
  startMs: number;
  endMs: number;
  /** Anything but "cancelled" blocks, including statuses we have never seen (D6). */
  status: string;
  customerName: string | null;
  /** API ISO string; null for the bookings that come from data.json. */
  createdAt: string | null;
}

export type WarningCode =
  | 'INVALID_RECORD'
  | 'DUPLICATE_ID'
  | 'VENUE_NO_POSITION'
  | 'BOOKING_OVERLAP'
  | 'BOOKING_OVERLAPS_BREAK'
  | 'BOOKING_OUTSIDE_HOURS'
  | 'STAFF_HOURS_EXCEED_VENUE'
  | 'BOOKING_UNKNOWN_STAFF'
  | 'BOOKING_UNKNOWN_SERVICE'
  | 'BOOKING_DURATION_MISMATCH';

/** Warnings carry ids only. They must never contain customer names or other personal data. */
export interface DataWarning {
  code: WarningCode;
  message: string;
  ids: Array<string | number>;
}

export interface DataModel {
  venues: Venue[];
  venueById: Map<number, Venue>;
  serviceById: Map<number, { service: Service; venue: Venue }>;
  staffById: Map<number, { staff: Staff; venue: Venue }>;
  /** The bookings from data.json, including cancelled ones. */
  bookings: Booking[];
  warnings: DataWarning[];
}

export interface BookingFields {
  id: string;
  staffId: number;
  serviceId: number;
  start: DateTime;
  end: DateTime;
  status: string;
  customerName?: string | null;
  createdAt?: string | null;
}

export function makeBooking(f: BookingFields): Booking {
  return {
    id: f.id,
    staffId: f.staffId,
    serviceId: f.serviceId,
    start: f.start,
    end: f.end,
    startMs: f.start.toMillis(),
    endMs: f.end.toMillis(),
    status: f.status,
    customerName: f.customerName ?? null,
    createdAt: f.createdAt ?? null,
  };
}

export function blocks(booking: Pick<Booking, 'status'>): boolean {
  return booking.status !== 'cancelled';
}

/** Half-open intervals [start, end): back-to-back does not overlap (CLAUDE.md rule 5). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function rawId(raw: unknown, fallback: string): string | number {
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return fallback;
}

/** Only field paths and issue codes, never the offending values, so no personal data leaks. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`).join(', ');
}

export function loadData(path: string): DataModel {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read data file ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Data file ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const root = rawFileSchema.safeParse(json);
  if (!root.success) {
    throw new Error(
      `Data file ${path} does not have the expected shape (venues[], bookings[]): ${describeIssues(root.error)}`,
    );
  }

  const warnings: DataWarning[] = [];
  const warn = (code: WarningCode, message: string, ids: Array<string | number>) =>
    warnings.push({ code, message, ids });
  const skipInvalid = (kind: string, label: string, raw: unknown, error: z.ZodError) =>
    warn('INVALID_RECORD', `Skipped invalid ${kind} at ${label}: ${describeIssues(error)}`, [rawId(raw, label)]);
  const skipDuplicate = (kind: string, id: string | number) =>
    warn('DUPLICATE_ID', `Skipped ${kind} with duplicate id ${id}`, [id]);

  const venues: Venue[] = [];
  const venueById = new Map<number, Venue>();
  const serviceById = new Map<number, { service: Service; venue: Venue }>();
  const staffById = new Map<number, { staff: Staff; venue: Venue }>();

  for (const [i, rawVenue] of root.data.venues.entries()) {
    const parsed = rawVenueSchema.safeParse(rawVenue);
    if (!parsed.success) {
      skipInvalid('venue', `venues[${i}]`, rawVenue, parsed.error);
      continue;
    }
    const v = parsed.data;
    if (venueById.has(v.id)) {
      skipDuplicate('venue', v.id);
      continue;
    }
    const venue: Venue = {
      id: v.id,
      name: v.name,
      position: v.position ?? null,
      openingHours: v.openingHours,
      services: [],
      staff: [],
    };
    venueById.set(venue.id, venue);
    venues.push(venue);

    for (const [j, rawService] of v.services.entries()) {
      const s = rawServiceSchema.safeParse(rawService);
      if (!s.success) {
        skipInvalid('service', `venues[${i}].services[${j}]`, rawService, s.error);
        continue;
      }
      if (serviceById.has(s.data.id)) {
        skipDuplicate('service', s.data.id);
        continue;
      }
      venue.services.push(s.data);
      serviceById.set(s.data.id, { service: s.data, venue });
    }

    for (const [j, rawStaff] of v.staff.entries()) {
      const s = rawStaffSchema.safeParse(rawStaff);
      if (!s.success) {
        skipInvalid('staff member', `venues[${i}].staff[${j}]`, rawStaff, s.error);
        continue;
      }
      if (staffById.has(s.data.id)) {
        skipDuplicate('staff member', s.data.id);
        continue;
      }
      venue.staff.push(s.data);
      staffById.set(s.data.id, { staff: s.data, venue });
    }

    if (venue.position === null) {
      warn('VENUE_NO_POSITION', `Venue ${venue.id} has no position and is excluded from search`, [venue.id]);
    }
  }

  // Q6: staff hours that extend past, or fall on a day outside, the venue's opening hours.
  for (const { staff, venue } of staffById.values()) {
    for (const [day, hours] of Object.entries(staff.workingHours)) {
      if (!hours) continue;
      const open = venue.openingHours[day as keyof WeekHours];
      const [from, to] = hours;
      if (!open) {
        warn(
          'STAFF_HOURS_EXCEED_VENUE',
          `Staff ${staff.id} works ${day} ${from}-${to} but venue ${venue.id} is closed that day`,
          [staff.id, venue.id],
        );
      } else if (from < open[0] || to > open[1]) {
        // Safe to compare as strings: both are zero-padded HH:mm, not ISO date-times.
        warn(
          'STAFF_HOURS_EXCEED_VENUE',
          `Staff ${staff.id} works ${day} ${from}-${to} but venue ${venue.id} is open ${open[0]}-${open[1]}`,
          [staff.id, venue.id],
        );
      }
    }
  }

  const bookings: Booking[] = [];
  const bookingIds = new Set<string>();

  for (const [i, rawBooking] of root.data.bookings.entries()) {
    const parsed = rawBookingSchema.safeParse(rawBooking);
    if (!parsed.success) {
      skipInvalid('booking', `bookings[${i}]`, rawBooking, parsed.error);
      continue;
    }
    const b = parsed.data;
    const start = parseInstant(b.start);
    const end = parseInstant(b.end);
    if (!start.isValid || !end.isValid || end.toMillis() <= start.toMillis()) {
      warn('INVALID_RECORD', `Skipped booking ${b.id}: start/end is not a valid, non-empty interval`, [b.id]);
      continue;
    }
    if (bookingIds.has(b.id)) {
      skipDuplicate('booking', b.id);
      continue;
    }
    bookingIds.add(b.id);
    bookings.push(
      makeBooking({
        id: b.id,
        staffId: b.staffId,
        serviceId: b.serviceId,
        start,
        end,
        status: b.status,
        customerName: b.customerName,
      }),
    );
  }

  for (const booking of bookings) {
    const staffEntry = staffById.get(booking.staffId);
    const serviceEntry = serviceById.get(booking.serviceId);
    if (!staffEntry) {
      warn('BOOKING_UNKNOWN_STAFF', `Booking ${booking.id} refers to unknown staff ${booking.staffId}`, [
        booking.id,
        booking.staffId,
      ]);
    }
    if (!serviceEntry) {
      warn('BOOKING_UNKNOWN_SERVICE', `Booking ${booking.id} refers to unknown service ${booking.serviceId}`, [
        booking.id,
        booking.serviceId,
      ]);
    } else {
      const expectedMs = serviceEntry.service.durationMinutes * 60_000;
      if (booking.endMs - booking.startMs !== expectedMs) {
        warn(
          'BOOKING_DURATION_MISMATCH',
          `Booking ${booking.id} lasts ${(booking.endMs - booking.startMs) / 60_000} min but service ${booking.serviceId} takes ${serviceEntry.service.durationMinutes} min`,
          [booking.id, booking.serviceId],
        );
      }
    }
    if (staffEntry && blocks(booking)) checkAgainstSchedule(booking, staffEntry, warn);
  }

  // Q2: overlapping blocking bookings for the same staff member.
  const blockingByStaff = new Map<number, Booking[]>();
  for (const booking of bookings) {
    if (!blocks(booking)) continue;
    const list = blockingByStaff.get(booking.staffId) ?? [];
    list.push(booking);
    blockingByStaff.set(booking.staffId, list);
  }
  for (const [staffId, list] of blockingByStaff) {
    list.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    for (const [i, a] of list.entries()) {
      for (const b of list.slice(i + 1)) {
        if (b.startMs >= a.endMs) break;
        if (overlaps(a.startMs, a.endMs, b.startMs, b.endMs)) {
          warn('BOOKING_OVERLAP', `Staff ${staffId} has overlapping bookings ${a.id} and ${b.id}`, [a.id, b.id]);
        }
      }
    }
  }

  return { venues, venueById, serviceById, staffById, bookings, warnings };
}

/** Q3: a booking that runs into a break, or outside the staff member's or the venue's hours. */
function checkAgainstSchedule(
  booking: Booking,
  { staff, venue }: { staff: Staff; venue: Venue },
  warn: (code: WarningCode, message: string, ids: Array<string | number>) => unknown,
): void {
  const date = localDateString(booking.start);
  const day = weekdayKey(booking.start);
  const venueHours = venue.openingHours[day];
  const staffHours = staff.workingHours[day];

  let outside = !venueHours || !staffHours;
  if (venueHours && staffHours) {
    const open = Math.max(
      localDateTime(date, venueHours[0]).toMillis(),
      localDateTime(date, staffHours[0]).toMillis(),
    );
    const close = Math.min(
      localDateTime(date, venueHours[1]).toMillis(),
      localDateTime(date, staffHours[1]).toMillis(),
    );
    outside = booking.startMs < open || booking.endMs > close;
  }
  if (outside) {
    warn(
      'BOOKING_OUTSIDE_HOURS',
      `Booking ${booking.id} falls outside the working or opening hours of staff ${staff.id} at venue ${venue.id}`,
      [booking.id, staff.id],
    );
  }

  for (const br of staff.breaks) {
    if (!br.days.includes(day)) continue;
    const breakStart = localDateTime(date, br.start).toMillis();
    const breakEnd = localDateTime(date, br.end).toMillis();
    if (overlaps(booking.startMs, booking.endMs, breakStart, breakEnd)) {
      warn(
        'BOOKING_OVERLAPS_BREAK',
        `Booking ${booking.id} overlaps the ${br.start}-${br.end} break of staff ${staff.id}`,
        [booking.id, staff.id],
      );
    }
  }
}
