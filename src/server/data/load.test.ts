import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { DATA_PATH } from '../config';
import { localDateTime, toApiIso, ZONE } from '../domain/time';
import { loadData, makeBooking, type Booking, type DataModel } from './load';
import { BookingStore } from './store';

const NOW = DateTime.fromISO('2026-10-22T08:00:00+02:00', { setZone: true });

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'booking-test-'));
}

function bookingOf(model: DataModel, id: string): Booking {
  const b = model.bookings.find((x) => x.id === id);
  if (!b) throw new Error(`booking ${id} not loaded`);
  return b;
}

describe('loadData with the real data.json', () => {
  const model = loadData(DATA_PATH);

  it('indexes venues, services and staff', () => {
    expect(model.venues.map((v) => v.id)).toEqual([1, 2, 3, 4]);
    expect(model.serviceById.get(201)?.venue.id).toBe(2);
    expect(model.staffById.get(3002)?.venue.name).toBe('Klippotek');
    expect(model.bookings).toHaveLength(7);
  });

  it('reports exactly the known quirks and nothing else', () => {
    const codes = [...new Set(model.warnings.map((w) => w.code))].sort();
    expect(codes).toEqual(
      ['BOOKING_OVERLAP', 'BOOKING_OVERLAPS_BREAK', 'STAFF_HOURS_EXCEED_VENUE', 'VENUE_NO_POSITION'].sort(),
    );
    expect(model.warnings).toHaveLength(4);
  });

  it('Q1: venue 4 has no position', () => {
    expect(model.venueById.get(4)?.position).toBeNull();
    const w = model.warnings.find((x) => x.code === 'VENUE_NO_POSITION');
    expect(w?.ids).toEqual([4]);
  });

  it('Q2: b4 and b5 overlap for Sara', () => {
    const w = model.warnings.find((x) => x.code === 'BOOKING_OVERLAP');
    expect(w?.ids).toEqual(['b4', 'b5']);
  });

  it("Q3: b2 runs into Anna's break", () => {
    const w = model.warnings.find((x) => x.code === 'BOOKING_OVERLAPS_BREAK');
    expect(w?.ids).toEqual(['b2', 1001]);
  });

  it('Q6: Erik works Saturday past the venue closing time', () => {
    const w = model.warnings.find((x) => x.code === 'STAFF_HOURS_EXCEED_VENUE');
    expect(w?.ids).toEqual([1002, 1]);
    expect(w?.message).toContain('sat');
  });

  it('Q4: b3 loads as cancelled', () => {
    expect(bookingOf(model, 'b3').status).toBe('cancelled');
  });

  it('Q5: b6 (09:00Z) is 10:00 in Europe/Stockholm', () => {
    const b6 = bookingOf(model, 'b6');
    expect(b6.start.toMillis()).toBe(localDateTime('2026-10-26', '10:00').toMillis());
    expect(b6.startMs).toBe(Date.UTC(2026, 9, 26, 9, 0, 0)); // hand-computed UTC instant
    expect(b6.start.zoneName).toBe(ZONE);
    expect(b6.start.hour).toBe(10);
  });

  it('Q5: b4 keeps its +01:00 offset after conversion to the zone', () => {
    const b4 = bookingOf(model, 'b4');
    expect(b4.start.zoneName).toBe(ZONE);
    expect(b4.start.offset).toBe(60);
    expect(toApiIso(b4.start)).toBe('2026-10-25T08:00:00+01:00');
    expect(b4.startMs).toBe(Date.UTC(2026, 9, 25, 7, 0, 0));
  });

  it('warnings contain only ids and messages without personal data', () => {
    for (const w of model.warnings) {
      expect(Object.keys(w).sort()).toEqual(['code', 'ids', 'message']);
    }
  });
});

describe('loadData with broken input', () => {
  function write(content: string): string {
    const path = join(tempDir(), 'data.json');
    writeFileSync(path, content);
    return path;
  }

  it('throws a clear error for invalid JSON', () => {
    expect(() => loadData(write('{ nope'))).toThrow(/not valid JSON/);
  });

  it('throws a clear error for the wrong top-level shape', () => {
    expect(() => loadData(write('{"venues": 1}'))).toThrow(/expected shape/);
  });

  it('throws a clear error for a missing file', () => {
    expect(() => loadData(join(tempDir(), 'missing.json'))).toThrow(/Cannot read data file/);
  });

  it('skips invalid records with a warning instead of failing the file', () => {
    const good = {
      id: 1,
      name: 'V',
      position: { lat: 59, lng: 18 },
      openingHours: { mon: ['09:00', '17:00'] },
      services: [
        { id: 10, name: 'S', durationMinutes: 30, priceSek: 100 },
        { id: 11, name: 'Bad', durationMinutes: -5, priceSek: 100 },
      ],
      staff: [{ id: 100, name: 'A', serviceIds: [10], workingHours: { mon: ['09:00', '17:00'] } }],
    };
    const model = loadData(
      write(
        JSON.stringify({
          venues: [good, { id: 2, name: 'Broken' }],
          bookings: [
            { id: 'x1', staffId: 100, serviceId: 10, start: '2026-10-26T09:00:00+01:00', end: '2026-10-26T09:30:00+01:00', status: 'confirmed' },
            { id: 'x2', staffId: 999, serviceId: 998, start: '2026-10-26T09:00:00+01:00', end: '2026-10-26T09:45:00+01:00', status: 'pending' },
            { id: 'x3', start: 'garbage' },
          ],
        }),
      ),
    );
    expect(model.venues.map((v) => v.id)).toEqual([1]);
    expect(model.venueById.get(1)?.staff[0]?.breaks).toEqual([]); // breaks default to []
    expect(model.serviceById.has(11)).toBe(false);
    expect(model.bookings.map((b) => b.id)).toEqual(['x1', 'x2']);
    expect(bookingOf(model, 'x2').status).toBe('pending'); // unknown statuses still load
    const codes = model.warnings.map((w) => w.code);
    expect(codes.filter((c) => c === 'INVALID_RECORD')).toHaveLength(3);
    expect(codes).toContain('BOOKING_UNKNOWN_STAFF');
    expect(codes).toContain('BOOKING_UNKNOWN_SERVICE');
  });

  it('warns when a booking length differs from the service duration', () => {
    const venue = {
      id: 1,
      name: 'V',
      position: null,
      openingHours: { mon: ['09:00', '17:00'] },
      services: [{ id: 10, name: 'S', durationMinutes: 30, priceSek: 100 }],
      staff: [{ id: 100, name: 'A', serviceIds: [10], workingHours: { mon: ['09:00', '17:00'] } }],
    };
    const model = loadData(
      write(
        JSON.stringify({
          venues: [venue],
          bookings: [
            { id: 'y1', staffId: 100, serviceId: 10, start: '2026-10-26T09:00:00+01:00', end: '2026-10-26T10:00:00+01:00', status: 'confirmed' },
          ],
        }),
      ),
    );
    expect(model.warnings.map((w) => w.code)).toContain('BOOKING_DURATION_MISMATCH');
  });
});

describe('BookingStore', () => {
  const model = loadData(DATA_PATH);

  function runtimeBooking(id: string, staffId: number, startLocal: string, minutes: number): Booking {
    const start = DateTime.fromISO(startLocal, { zone: ZONE });
    return makeBooking({
      id,
      staffId,
      serviceId: 101,
      start,
      end: start.plus({ minutes }),
      status: 'confirmed',
      customerName: 'Åsa Öberg',
      createdAt: toApiIso(NOW),
    });
  }

  it('starts with the data.json bookings, sorted by start', () => {
    const store = new BookingStore(model.bookings, null);
    expect(store.listForStaff(2001).map((b) => b.id)).toEqual(['b4', 'b5']);
    expect(store.listForStaff(424242)).toEqual([]);
  });

  it('add() then listForStaff() returns bookings sorted by start', () => {
    const store = new BookingStore(model.bookings, null);
    // Added out of order, on purpose: one after b1/b2, one before them.
    store.add(runtimeBooking('n1', 1001, '2026-10-23T13:00:00', 60));
    store.add(runtimeBooking('n2', 1001, '2026-10-23T09:00:00', 60));
    expect(store.listForStaff(1001).map((b) => b.id)).toEqual(['n2', 'b1', 'b2', 'n1']);
  });

  it('persists runtime bookings only, and a new store reads them back', () => {
    const persistPath = join(tempDir(), 'nested', 'bookings.local.json');
    const first = new BookingStore(model.bookings, persistPath);
    first.add(runtimeBooking('n1', 1001, '2026-10-23T13:00:00', 60));
    first.add(runtimeBooking('n2', 1002, '2026-10-24T11:00:00', 60));

    const saved: unknown = JSON.parse(readFileSync(persistPath, 'utf8'));
    expect(Array.isArray(saved) && saved.map((r: { id: string }) => r.id)).toEqual(['n1', 'n2']);

    const second = new BookingStore(model.bookings, persistPath);
    expect(second.listForStaff(1001).map((b) => b.id)).toEqual(['b1', 'b2', 'n1']);
    const n1 = second.listForStaff(1001).find((b) => b.id === 'n1');
    expect(n1?.customerName).toBe('Åsa Öberg');
    expect(toApiIso(n1?.start ?? NOW)).toBe('2026-10-23T13:00:00+02:00');
    expect(n1?.startMs).toBe(Date.UTC(2026, 9, 23, 11, 0, 0)); // hand-computed
  });

  it('refuses a corrupt persisted file instead of silently dropping bookings', () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    const persistPath = join(dir, 'bookings.local.json');
    writeFileSync(persistPath, '{ not json');
    expect(() => new BookingStore(model.bookings, persistPath)).toThrow(/Cannot read saved bookings/);
  });
});

describe('buildApp', () => {
  it('loads the data and decorates the instance', async () => {
    const app = buildApp({ now: () => NOW, persistPath: null });
    expect(app.model.venues).toHaveLength(4);
    expect(app.store.listForStaff(2001)).toHaveLength(2);
    expect(app.now().toMillis()).toBe(NOW.toMillis());
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
