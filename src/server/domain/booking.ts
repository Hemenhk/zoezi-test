import { randomUUID } from 'node:crypto';
import type { DateTime } from 'luxon';
import type { BookingDto, CreateBookingInput, SlotDto } from '@shared/schemas';
import { blocks, makeBooking, type Booking, type DataModel, type Service, type Venue } from '../data/load';
import type { BookingStore } from '../data/store';
import { computeSlots, findSlot, type AvailabilityContext } from './availability';
import { localDateString, parseInstant, toApiIso } from './time';

export type BookingErrorCode =
  | 'SERVICE_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  | 'STAFF_CANNOT_PERFORM'
  | 'SLOT_IN_PAST'
  | 'SLOT_INVALID'
  | 'SLOT_TAKEN'
  | 'IDEMPOTENCY_KEY_REUSED';

/** Messages hold ids and times only, never the customer's name (CLAUDE.md rule 8). */
export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    message: string,
    readonly alternatives?: SlotDto[],
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

/**
 * Idempotency-Key → the request it was first used with and the booking it produced (D16).
 * Memory only: the keys are lost on restart, while the bookings themselves are persisted.
 */
export class IdempotencyKeys {
  private readonly entries = new Map<string, { fingerprint: string; bookingId: string }>();

  get(key: string) {
    return this.entries.get(key);
  }

  set(key: string, fingerprint: string, bookingId: string): void {
    this.entries.set(key, { fingerprint, bookingId });
  }
}

export interface CreateBookingDeps {
  model: DataModel;
  store: BookingStore;
  now: DateTime;
  idempotency: IdempotencyKeys;
  idempotencyKey?: string;
}

export interface CreateBookingResult {
  booking: Booking;
  replayed: boolean;
}

const ALTERNATIVES_MAX = 3;
const ALTERNATIVES_DAYS_AHEAD = 7;

/**
 * "Identical body" compares the validated input with start as an instant, so the same time
 * written as "Z" or "+02:00" counts as the same request.
 */
function fingerprint(input: CreateBookingInput, startMs: number): string {
  return JSON.stringify([input.serviceId, input.staffId, startMs, input.customerName]);
}

/** D13: the fewest blocking bookings on that local date, lowest id on a tie. */
function pickStaff(candidates: readonly number[], store: BookingStore, date: string): number {
  let best: { id: number; count: number } | null = null;
  for (const id of [...candidates].sort((a, b) => a - b)) {
    const count = store
      .listForStaff(id)
      .filter((b) => blocks(b) && localDateString(b.start) === date).length;
    if (best === null || count < best.count) best = { id, count };
  }
  if (best === null) throw new Error('pickStaff needs at least one candidate');
  return best.id;
}

function alternatives(ctx: AvailabilityContext, start: DateTime): SlotDto[] {
  const fromDate = localDateString(start);
  const toDate = localDateString(start.plus({ days: ALTERNATIVES_DAYS_AHEAD }));
  const startMs = start.toMillis();
  return computeSlots({ ...ctx, fromDate, toDate })
    .flatMap((d) => d.slots)
    .filter((s) => s.start.toMillis() >= startMs)
    .slice(0, ALTERNATIVES_MAX)
    .map((s) => ({ start: toApiIso(s.start), end: toApiIso(s.end), staffIds: s.staffIds }));
}

export function createBooking(input: CreateBookingInput, deps: CreateBookingDeps): CreateBookingResult {
  const { model, store, now, idempotency, idempotencyKey } = deps;

  // (c, early) The schema guarantees an ISO string with an offset; normalise to Stockholm.
  const start = parseInstant(input.start);
  if (!start.isValid) throw new BookingError('SLOT_INVALID', 'start is not a valid date-time');
  const print = fingerprint(input, start.toMillis());

  // (a) Idempotency (D16).
  if (idempotencyKey !== undefined) {
    const seen = idempotency.get(idempotencyKey);
    if (seen) {
      if (seen.fingerprint !== print) {
        throw new BookingError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request');
      }
      const original = store.getRuntime(seen.bookingId);
      if (!original) throw new Error(`Idempotency key points at missing booking ${seen.bookingId}`);
      return { booking: original, replayed: true };
    }
  }

  // (b) Service and staff (D14: the venue comes from the service).
  const serviceEntry = model.serviceById.get(input.serviceId);
  if (!serviceEntry) throw new BookingError('SERVICE_NOT_FOUND', `Service ${input.serviceId} does not exist`);
  const { service, venue } = serviceEntry;
  if (input.staffId !== null) {
    const staffEntry = model.staffById.get(input.staffId);
    if (!staffEntry) throw new BookingError('STAFF_NOT_FOUND', `Staff member ${input.staffId} does not exist`);
    if (staffEntry.venue.id !== venue.id || !staffEntry.staff.serviceIds.includes(service.id)) {
      throw new BookingError(
        'STAFF_CANNOT_PERFORM',
        `Staff member ${input.staffId} does not offer service ${service.id} at venue ${venue.id}`,
      );
    }
  }

  // (c) Past check (D7: a start at or before now is never bookable).
  if (start.toMillis() <= now.toMillis()) {
    throw new BookingError('SLOT_IN_PAST', 'That time has already passed');
  }

  // ---------------------------------------------------------------------------------------
  // From here to store.add() there must be NO await (D15). Node runs this synchronously,
  // so no other request can book between the availability check and the insert; an await
  // would yield to the event loop and let a concurrent request take the same slot.
  // store.add() persists with writeFileSync for the same reason.
  // ---------------------------------------------------------------------------------------
  const ctx = availabilityContext(venue, service, store, now);

  // (d) The same engine search uses (CLAUDE.md rule 3); no separate overlap check.
  const slot = findSlot({ ...ctx, start });
  const staffId =
    slot === null
      ? null
      : input.staffId === null
        ? pickStaff(slot.staffIds, store, localDateString(start))
        : slot.staffIds.includes(input.staffId)
          ? input.staffId
          : null;

  // (e) Taken (409) or never bookable (422)?
  if (staffId === null) {
    const ignoring = findSlot({ ...ctx, start, ignoreBookings: true });
    const wouldBeValid = ignoring !== null && (input.staffId === null || ignoring.staffIds.includes(input.staffId));
    if (wouldBeValid) {
      throw new BookingError('SLOT_TAKEN', 'That time has just been booked', alternatives(ctx, start));
    }
    throw new BookingError('SLOT_INVALID', 'That time cannot be booked for this service');
  }

  // (f) Create, insert and persist.
  const booking = makeBooking({
    id: randomUUID(),
    staffId,
    serviceId: service.id,
    start,
    end: start.plus({ minutes: service.durationMinutes }),
    status: 'confirmed',
    customerName: input.customerName,
    createdAt: toApiIso(now),
  });
  store.add(booking);
  if (idempotencyKey !== undefined) idempotency.set(idempotencyKey, print, booking.id);
  return { booking, replayed: false };
}

function availabilityContext(venue: Venue, service: Service, store: BookingStore, now: DateTime): AvailabilityContext {
  return { venue, service, staff: venue.staff, bookingsByStaff: (id) => store.listForStaff(id), now };
}

/** The API shape of a runtime booking, or null if it refers to ids the model doesn't know. */
export function toBookingDto(booking: Booking, model: DataModel): BookingDto | null {
  const serviceEntry = model.serviceById.get(booking.serviceId);
  const staffEntry = model.staffById.get(booking.staffId);
  if (!serviceEntry || !staffEntry || booking.customerName === null || booking.createdAt === null) return null;
  const { service, venue } = serviceEntry;
  return {
    id: booking.id,
    status: booking.status,
    customerName: booking.customerName,
    start: toApiIso(booking.start),
    end: toApiIso(booking.end),
    venue: { id: venue.id, name: venue.name },
    service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes, priceSek: service.priceSek },
    staff: { id: staffEntry.staff.id, name: staffEntry.staff.name },
    createdAt: booking.createdAt,
  };
}
