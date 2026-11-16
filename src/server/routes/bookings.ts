import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBookingSchema, type BookingResponse } from '@shared/schemas';
import { BookingError, createBooking, toBookingDto, type BookingErrorCode } from '../domain/booking';
import { sendError } from '../errors';

const STATUS: Record<BookingErrorCode, number> = {
  SERVICE_NOT_FOUND: 404,
  STAFF_NOT_FOUND: 404,
  STAFF_CANNOT_PERFORM: 422,
  SLOT_IN_PAST: 422,
  SLOT_INVALID: 422,
  SLOT_TAKEN: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
};

const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();
const bookingParamsSchema = z.object({ id: z.string().min(1).max(100) });

export function bookingRoutes(app: FastifyInstance): void {
  app.post('/api/bookings', async (req, reply) => {
    const body = createBookingSchema.safeParse(req.body);
    if (!body.success) {
      // Issues only carry messages and paths; Zod does not echo the rejected value, so the
      // customer's name is not sent back or logged.
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid booking request', {
        details: z.flattenError(body.error),
      });
    }
    const key = idempotencyKeySchema.safeParse(req.headers['idempotency-key']);
    if (!key.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid Idempotency-Key header', {
        details: z.flattenError(key.error),
      });
    }

    try {
      // createBooking is synchronous: check, insert and persist happen without yielding (D15).
      const { booking, replayed } = createBooking(body.data, {
        model: app.model,
        store: app.store,
        now: app.now(), // read per request, never captured at startup
        idempotency: app.idempotency,
        ...(key.data !== undefined ? { idempotencyKey: key.data } : {}),
      });
      const dto = toBookingDto(booking, app.model);
      if (!dto) throw new Error(`Booking ${booking.id} cannot be shown`);
      const response: BookingResponse = { booking: dto };
      return reply.code(replayed ? 200 : 201).send(response);
    } catch (err) {
      if (err instanceof BookingError) {
        return sendError(reply, STATUS[err.code], err.code, err.message, {
          ...(err.alternatives ? { alternatives: err.alternatives } : {}),
        });
      }
      throw err;
    }
  });

  app.get('/api/bookings/:id', async (req, reply) => {
    const params = bookingParamsSchema.safeParse(req.params);
    const booking = params.success ? app.store.getRuntime(params.data.id) : undefined;
    // Only API-created bookings; the data.json ones have no customer (Q8) and give a 404.
    const dto = booking ? toBookingDto(booking, app.model) : null;
    if (!dto) return sendError(reply, 404, 'BOOKING_NOT_FOUND', 'No booking with that id');
    const response: BookingResponse = { booking: dto };
    return response;
  });
}
