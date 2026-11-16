import { DateTime } from 'luxon';
import { blocks, type Booking, type Service, type Staff, type Venue } from '../data/load';
import { localDateString, localDateTime, weekdayKey, ZONE } from './time';

export interface Slot {
  start: DateTime;
  end: DateTime;
  /** Staff who can take this slot, sorted ascending (D13). */
  staffIds: number[];
}

export interface DaySlots {
  /** Local calendar date at the venue, "YYYY-MM-DD". */
  date: string;
  slots: Slot[];
}

export interface AvailabilityContext {
  venue: Venue;
  service: Service;
  /** Candidate staff, normally venue.staff. Only those offering the service are used. */
  staff: readonly Staff[];
  /** All bookings for a staff member, cancelled ones included (e.g. store.listForStaff). */
  bookingsByStaff: (staffId: number) => readonly Booking[];
  now: DateTime;
  stepMinutes?: number;
  /**
   * Treat every booking as absent. Booking uses this to tell a slot that is taken (409)
   * from one that could never be booked (422).
   */
  ignoreBookings?: boolean;
}

export interface ComputeSlotsInput extends AvailabilityContext {
  /** Inclusive local calendar dates, "YYYY-MM-DD". */
  fromDate: string;
  toDate: string;
}

/** Half-open interval in epoch milliseconds: [start, end). */
interface Interval {
  start: number;
  end: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function startOfLocalDay(date: string): DateTime {
  if (!DATE.test(date)) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  const dt = DateTime.fromISO(date, { zone: ZONE }).startOf('day');
  if (!dt.isValid) throw new Error(`Invalid date "${date}": ${dt.invalidExplanation}`);
  return dt;
}

/** Removes the blockers from the window. Intervals are half-open, so touching ones don't cut. */
function subtract(window: Interval, blockers: Interval[]): Interval[] {
  const sorted = [...blockers].sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

/** Free time for one staff member on one local date, after hours, breaks and bookings. */
function freeSegments(ctx: AvailabilityContext, staff: Staff, date: string, day: DateTime): Interval[] {
  const key = weekdayKey(day);
  // A missing day and a null day both mean closed (D5, Q7).
  const venueHours = ctx.venue.openingHours[key];
  const staffHours = staff.workingHours[key];
  if (!venueHours || !staffHours) return [];

  // The venue is the outer limit (D5, Q6).
  const window: Interval = {
    start: Math.max(localDateTime(date, venueHours[0]).toMillis(), localDateTime(date, staffHours[0]).toMillis()),
    end: Math.min(localDateTime(date, venueHours[1]).toMillis(), localDateTime(date, staffHours[1]).toMillis()),
  };
  if (window.start >= window.end) return [];

  const blockers: Interval[] = [];
  for (const br of staff.breaks) {
    if (!br.days.includes(key)) continue;
    blockers.push({
      start: localDateTime(date, br.start).toMillis(),
      end: localDateTime(date, br.end).toMillis(),
    });
  }
  if (!ctx.ignoreBookings) {
    for (const b of ctx.bookingsByStaff(staff.id)) {
      // Everything except "cancelled" blocks, unknown statuses included (D6, Q4).
      if (!blocks(b)) continue;
      if (b.startMs < window.end && window.start < b.endMs) {
        blockers.push({ start: b.startMs, end: b.endMs });
      }
    }
  }
  return subtract(window, blockers);
}

/** The first grid point at or after `ms`, on a grid aligned to the local hour (D4). */
function firstGridStart(ms: number, stepMinutes: number): DateTime {
  let t = DateTime.fromMillis(ms, { zone: ZONE }).startOf('hour');
  while (t.toMillis() < ms) t = t.plus({ minutes: stepMinutes });
  return t;
}

function slotsForDay(ctx: AvailabilityContext, date: string, day: DateTime): Slot[] {
  const step = ctx.stepMinutes ?? 15;
  const duration = ctx.service.durationMinutes;
  const nowMs = ctx.now.toMillis();
  const byStart = new Map<number, Slot>();

  for (const staff of ctx.staff) {
    if (!staff.serviceIds.includes(ctx.service.id)) continue;
    for (const seg of freeSegments(ctx, staff, date, day)) {
      for (let start = firstGridStart(seg.start, step); ; start = start.plus({ minutes: step })) {
        const end = start.plus({ minutes: duration });
        if (end.toMillis() > seg.end) break;
        // Slots that start at or before now are excluded (D7).
        if (start.toMillis() <= nowMs) continue;
        const existing = byStart.get(start.toMillis());
        if (existing) existing.staffIds.push(staff.id);
        else byStart.set(start.toMillis(), { start, end, staffIds: [staff.id] });
      }
    }
  }

  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, slot]) => ({ ...slot, staffIds: [...slot.staffIds].sort((a, b) => a - b) }));
}

/**
 * Bookable slots per local date, fromDate to toDate inclusive. Every date appears,
 * even with no slots. Pure: no clock, no I/O.
 */
export function computeSlots(input: ComputeSlotsInput): DaySlots[] {
  const step = input.stepMinutes ?? 15;
  if (!Number.isInteger(step) || step <= 0 || 60 % step !== 0) {
    throw new Error(`stepMinutes must divide 60, got ${step}`);
  }
  const last = startOfLocalDay(input.toDate).toMillis();
  const days: DaySlots[] = [];
  // plus({ days: 1 }) is calendar arithmetic in the zone, so 23- and 25-hour days are fine.
  for (let day = startOfLocalDay(input.fromDate); day.toMillis() <= last; day = day.plus({ days: 1 })) {
    const date = localDateString(day);
    days.push({ date, slots: slotsForDay(input, date, day) });
  }
  return days;
}

/**
 * The slot starting exactly at `start`, or null if there is none. Uses computeSlots, so
 * booking and search share one definition of "available" (CLAUDE.md rule 3). Off-grid,
 * out-of-hours and past starts all give null.
 */
export function findSlot(ctx: AvailabilityContext & { start: DateTime }): Slot | null {
  const date = localDateString(ctx.start);
  const [day] = computeSlots({ ...ctx, fromDate: date, toDate: date });
  const startMs = ctx.start.toMillis();
  return day?.slots.find((s) => s.start.toMillis() === startMs) ?? null;
}
