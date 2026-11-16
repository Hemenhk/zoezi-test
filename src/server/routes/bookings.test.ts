import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bookingResponseSchema, searchResponseSchema } from '@shared/schemas';
import { buildApp } from '../app';

// Expected values come from docs/PLAN.md ("Expected slots", D13–D17, the API contract)
// or from hand calculation against data.json, noted next to each test.

const NOW = DateTime.fromISO('2026-10-22T08:00:00+02:00', { setZone: true });
const ANNA = 1001;
const ERIK = 1002;
const SARA = 2001;
const JOHAN = 3001;

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ now: () => NOW, persistPath: null });
});
afterEach(() => app.close());

interface Body {
  serviceId: number;
  staffId: number | null;
  start: string;
  customerName: string;
}

const body = (over: Partial<Body> = {}): Body => ({
  serviceId: 101,
  staffId: null,
  start: '2026-10-23T13:00:00+02:00',
  customerName: 'Åsa Öberg',
  ...over,
});

function post(payload: unknown, headers: Record<string, string> = {}, target = app) {
  return target.inject({ method: 'POST', url: '/api/bookings', payload: payload as object, headers });
}

describe('POST /api/bookings: happy path', () => {
  it('books 101 on Fri 23 Oct at 13:00 with any staff, assigning Erik (D13)', async () => {
    // Anna has b1 and b2 that day, Erik has none, so Erik has the fewest bookings.
    const res = await post(body());
    expect(res.statusCode).toBe(201);
    const { booking } = bookingResponseSchema.parse(res.json());
    expect(booking).toMatchObject({
      status: 'confirmed',
      customerName: 'Åsa Öberg',
      start: '2026-10-23T13:00:00+02:00',
      end: '2026-10-23T14:00:00+02:00',
      venue: { id: 1, name: 'Salongens Massage' },
      service: { id: 101, name: 'Klassisk massage', durationMinutes: 60, priceSek: 795 },
      staff: { id: ERIK, name: 'Erik' },
      createdAt: '2026-10-22T08:00:00+02:00',
    });
    expect(booking.id).toMatch(/^[0-9a-f-]{36}$/);

    const got = await app.inject({ url: `/api/bookings/${booking.id}` });
    expect(got.statusCode).toBe(200);
    expect(bookingResponseSchema.parse(got.json()).booking).toEqual(booking);
  });

  it('normalises a Z start to Stockholm time', async () => {
    // 09:00Z on 23 Oct is 11:00 local (+02:00); Erik is free 10:00–12:45 for 101.
    const res = await post(body({ staffId: ERIK, start: '2026-10-23T09:00:00Z' }));
    expect(res.statusCode).toBe(201);
    const { booking } = bookingResponseSchema.parse(res.json());
    expect(booking.start).toBe('2026-10-23T11:00:00+02:00');
    expect(booking.end).toBe('2026-10-23T12:00:00+02:00');
    expect(booking.staff.id).toBe(ERIK);
  });

  it.each(['Åsa Öberg-Lind', "O'Neil"])('accepts the name %s', async (customerName) => {
    const res = await post(body({ customerName }));
    expect(res.statusCode).toBe(201);
    expect(res.json().booking.customerName).toBe(customerName);
  });
});

describe('POST /api/bookings: conflicts', () => {
  it('409 SLOT_TAKEN when Anna is booked twice at 13:00, offering 13:00 with Erik', async () => {
    expect((await post(body({ staffId: ANNA }))).statusCode).toBe(201);
    const res = await post(body({ staffId: ANNA, customerName: 'Other Person' }));
    expect(res.statusCode).toBe(409);
    const { error } = res.json();
    expect(error.code).toBe('SLOT_TAKEN');
    expect(error.alternatives.length).toBeGreaterThan(0);
    expect(error.alternatives.length).toBeLessThanOrEqual(3);
    expect(error.alternatives[0]).toEqual({
      start: '2026-10-23T13:00:00+02:00',
      end: '2026-10-23T14:00:00+02:00',
      staffIds: [ERIK],
    });
  });

  it('lets exactly one of two concurrent requests win (Sat 24 Oct 10:00, only Erik works)', async () => {
    const payload = body({ start: '2026-10-24T10:00:00+02:00' });
    const results = await Promise.all([post(payload), post({ ...payload, customerName: 'Bo Ek' })]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
  });
});

describe('POST /api/bookings: rejections', () => {
  const cases: Array<[string, Partial<Body>, number, string]> = [
    ['an off-grid time (13:07)', { start: '2026-10-23T13:07:00+02:00' }, 422, 'SLOT_INVALID'],
    ['venue 1 on Sunday (closed)', { start: '2026-10-25T10:00:00+01:00' }, 422, 'SLOT_INVALID'],
    ['Johan for 302 (he only does 301)', { serviceId: 302, staffId: JOHAN, start: '2026-10-26T14:00:00+01:00' }, 422, 'STAFF_CANNOT_PERFORM'],
    ['Sara for 101 (another venue)', { staffId: SARA }, 422, 'STAFF_CANNOT_PERFORM'],
    ['service 999', { serviceId: 999 }, 404, 'SERVICE_NOT_FOUND'],
    ['staff 9999', { staffId: 9999 }, 404, 'STAFF_NOT_FOUND'],
    ['21 Oct (before now)', { start: '2026-10-21T13:00:00+02:00' }, 422, 'SLOT_IN_PAST'],
    ['a blank name', { customerName: '  ' }, 400, 'VALIDATION_ERROR'],
    ['a name with a control character', { customerName: 'Anna\u0007' }, 400, 'VALIDATION_ERROR'],
    ['a start without an offset', { start: '2026-10-23T13:00:00' }, 400, 'VALIDATION_ERROR'],
  ];
  it.each(cases)('rejects %s', async (_name, over, status, code) => {
    const res = await post(body(over));
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
  });

  it('422 SLOT_INVALID for Anna during her 12:00 break', async () => {
    const res = await post(body({ staffId: ANNA, start: '2026-10-23T12:00:00+02:00' }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SLOT_INVALID');
  });
});

describe('POST /api/bookings: idempotency (D16)', () => {
  it('replays the same key and body with 200 and the same booking', async () => {
    const headers = { 'idempotency-key': 'k-1' };
    const first = await post(body(), headers);
    const second = await post(body(), headers);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().booking.id).toBe(first.json().booking.id);
    // Only one booking: Erik has the new one (23 Oct) plus his cancelled b3 (24 Oct), sorted
    // by start; Anna still only b1 and b2.
    expect(app.store.listForStaff(ERIK).map((b) => b.id)).toEqual([first.json().booking.id, 'b3']);
    expect(app.store.listForStaff(ANNA).map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('422 IDEMPOTENCY_KEY_REUSED when the same key comes with a different start', async () => {
    const headers = { 'idempotency-key': 'k-2' };
    expect((await post(body(), headers)).statusCode).toBe(201);
    const res = await post(body({ start: '2026-10-23T14:00:00+02:00' }), headers);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('booking and search agree', () => {
  it('search no longer offers 13:00 for Anna after she is booked', async () => {
    const url = '/api/search?q=klassisk&lat=59.3143&lng=18.0736&from=2026-10-23&to=2026-10-23';
    const slotAt13 = async () => {
      const res = searchResponseSchema.parse((await app.inject({ url })).json());
      return res.results[0]?.days[0]?.slots.find((s) => s.start === '2026-10-23T13:00:00+02:00');
    };
    expect((await slotAt13())?.staffIds).toEqual([ANNA, ERIK]);
    expect((await post(body({ staffId: ANNA }))).statusCode).toBe(201);
    expect((await slotAt13())?.staffIds).toEqual([ERIK]);
  });
});

describe('GET /api/bookings/:id', () => {
  it('404 BOOKING_NOT_FOUND for a data.json booking (b1)', async () => {
    const res = await app.inject({ url: '/api/bookings/b1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('BOOKING_NOT_FOUND');
  });

  it('404 for an unknown id', async () => {
    const res = await app.inject({ url: '/api/bookings/00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('persistence', () => {
  it('a second app instance loads a booking from the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bookings-'));
    const persistPath = join(dir, 'bookings.local.json');
    try {
      const first = buildApp({ now: () => NOW, persistPath });
      const res = await post(body(), {}, first);
      expect(res.statusCode).toBe(201);
      const id = res.json().booking.id;
      await first.close();

      const second = buildApp({ now: () => NOW, persistPath });
      const got = await second.inject({ url: `/api/bookings/${id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json().booking).toEqual(res.json().booking);
      // And it still blocks: Erik is taken at 13:00 again, so a second request goes to Anna.
      const again = await post(body({ staffId: ERIK }), {}, second);
      expect(again.statusCode).toBe(409);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
