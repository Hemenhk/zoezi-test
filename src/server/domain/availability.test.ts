import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { DATA_PATH } from '../config';
import { loadData } from '../data/load';
import { BookingStore } from '../data/store';
import { computeSlots, findSlot, type DaySlots } from './availability';
import { localDateTime, toApiIso, ZONE } from './time';

// Expected values come from "Expected slots" in docs/PLAN.md, not from running the code.

const NOW = DateTime.fromISO('2026-10-22T08:00:00+02:00', { setZone: true });
const model = loadData(DATA_PATH);
const store = new BookingStore(model.bookings, null);

function ctxFor(serviceId: number, now: DateTime = NOW) {
  const entry = model.serviceById.get(serviceId);
  if (!entry) throw new Error(`service ${serviceId} not loaded`);
  return {
    venue: entry.venue,
    service: entry.service,
    staff: entry.venue.staff,
    bookingsByStaff: (id: number) => store.listForStaff(id),
    now,
  };
}

function slotsFor(serviceId: number, date: string, now: DateTime = NOW): DaySlots {
  const days = computeSlots({ ...ctxFor(serviceId, now), fromDate: date, toDate: date });
  expect(days).toHaveLength(1);
  const [day] = days;
  if (!day) throw new Error('no day');
  expect(day.date).toBe(date);
  return day;
}

type Row = [hm: string, staffIds: number[]];

/** Local "HH:mm" and staff ids of each slot. */
function rows(day: DaySlots): Row[] {
  return day.slots.map((s) => [s.start.setZone(ZONE).toFormat('HH:mm'), s.staffIds]);
}

/** Every 15-minute start from `first` to `last` inclusive, as written in the plan ("10:00–12:45"). */
function range(first: string, last: string, staffIds: number[]): Row[] {
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const out: Row[] = [];
  for (let m = toMin(first); m <= toMin(last); m += 15) {
    const hm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out.push([hm, staffIds]);
  }
  return out;
}

function at(day: DaySlots, hm: string): Row | undefined {
  return rows(day).find(([t]) => t === hm);
}

describe('computeSlots: venue 1, Fri 23 Oct', () => {
  it('service 101 (60 min)', () => {
    const day = slotsFor(101, '2026-10-23');
    expect(rows(day)).toEqual([
      ['09:00', [1001]],
      ...range('10:00', '12:45', [1002]),
      ...range('13:00', '16:00', [1001, 1002]),
      ...range('16:15', '17:00', [1002]),
    ]);
    // No 09:15–09:45: Anna would run into b1 at 10:00 and Erik starts at 10:00.
    for (const hm of ['09:15', '09:30', '09:45']) expect(at(day, hm)).toBeUndefined();
    // Nothing after 17:00.
    expect(day.slots.every((s) => s.start.toMillis() <= localDateTime('2026-10-23', '17:00').toMillis())).toBe(true);
  });

  it('service 102 (45 min): 09:15 ends exactly when b1 starts, so back-to-back is allowed', () => {
    const day = slotsFor(102, '2026-10-23');
    const tenAm = localDateTime('2026-10-23', '10:00').toMillis();
    const beforeTen = day.slots.filter((s) => s.start.toMillis() < tenAm);
    expect(rows({ ...day, slots: beforeTen })).toEqual([
      ['09:00', [1001]],
      ['09:15', [1001]],
    ]);
    // 09:30 would run into b1 at 10:00, and Erik starts at 10:00.
    expect(at(day, '09:30')).toBeUndefined();
    expect(at(day, '09:45')).toBeUndefined();
    // Erik's first slot is 10:00, and Anna is not in it (b1).
    const firstErik = rows(day).find(([, ids]) => ids.includes(1002));
    expect(firstErik).toEqual(['10:00', [1002]]);
  });

  it('service 103 (90 min, Anna only)', () => {
    const day = slotsFor(103, '2026-10-23');
    expect(rows(day)).toEqual(range('13:00', '15:30', [1001]));
  });
});

describe('computeSlots: venue 1, Sat 24 Oct', () => {
  it('service 101, Erik only, cut at the venue closing time (Q6), b3 cancelled (Q4)', () => {
    const day = slotsFor(101, '2026-10-24');
    expect(rows(day)).toEqual(range('10:00', '14:00', [1002]));
    expect(at(day, '10:00')).toEqual(['10:00', [1002]]);
    expect(at(day, '14:15')).toBeUndefined();
  });
});

describe('computeSlots: venue 1, Sun 25 Oct', () => {
  it('has no slots because the venue is closed', () => {
    for (const id of [101, 102, 103]) expect(slotsFor(id, '2026-10-25').slots).toEqual([]);
  });
});

describe('computeSlots: venue 2, Sun 25 Oct (DST ends)', () => {
  it('service 201: b4 and b5 block 08:00–09:20 (Q2), last slot 19:00, every start in +01:00', () => {
    const day = slotsFor(201, '2026-10-25');
    const first = day.slots[0];
    const last = day.slots.at(-1);
    expect(first && toApiIso(first.start)).toBe('2026-10-25T09:30:00+01:00');
    expect(last && toApiIso(last.start)).toBe('2026-10-25T19:00:00+01:00');
    for (const s of day.slots) expect(toApiIso(s.start)).toMatch(/\+01:00$/);
  });
});

describe('computeSlots: venue 3, Mon 26 Oct', () => {
  it('service 301 (30 min): b6 at 09:00Z is 10:00–10:30 local, b7 blocks Lina 13:00–14:00', () => {
    const day = slotsFor(301, '2026-10-26');
    // If 10:00 shows up as free, the Z offset was parsed wrong.
    for (const hm of ['09:45', '10:00', '10:15']) expect(at(day, hm)).toBeUndefined();
    expect(rows(day)).toEqual([
      ...range('09:00', '09:30', [3001]),
      ...range('10:30', '10:45', [3001]),
      ...range('11:00', '12:30', [3001, 3002]),
      ...range('12:45', '13:45', [3001]),
      ...range('14:00', '18:30', [3001, 3002]),
    ]);
  });

  it('service 302 (60 min, Lina only)', () => {
    const day = slotsFor(302, '2026-10-26');
    expect(rows(day)).toEqual([...range('11:00', '12:00', [3002]), ...range('14:00', '18:00', [3002])]);
  });
});

describe('computeSlots: clock', () => {
  it('excludes slots that start at or before now', () => {
    const now = DateTime.fromISO('2026-10-23T13:05:00+02:00', { setZone: true });
    const first = slotsFor(101, '2026-10-23', now).slots[0];
    expect(first && toApiIso(first.start)).toBe('2026-10-23T13:15:00+02:00');
  });
});

describe('computeSlots: date range', () => {
  it('lists every date in the range, including empty ones', () => {
    const days = computeSlots({ ...ctxFor(101), fromDate: '2026-10-23', toDate: '2026-10-26' });
    expect(days.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
    expect(days[2]?.slots).toEqual([]);
  });
});

describe('findSlot', () => {
  const start = (iso: string) => DateTime.fromISO(iso, { setZone: true });

  it('agrees with computeSlots, and ignoreBookings separates "taken" from "never valid"', () => {
    // Anna has b1 at 10:00 on Fri 23 Oct; Erik is free.
    const ctx = { ...ctxFor(101), start: start('2026-10-23T10:00:00+02:00') };
    expect(findSlot(ctx)?.staffIds).toEqual([1002]);
    expect(findSlot({ ...ctx, ignoreBookings: true })?.staffIds).toEqual([1001, 1002]);

    // Off the grid: never valid, with or without bookings.
    const offGrid = { ...ctxFor(101), start: start('2026-10-23T13:07:00+02:00') };
    expect(findSlot(offGrid)).toBeNull();
    expect(findSlot({ ...offGrid, ignoreBookings: true })).toBeNull();
  });

  it('accepts any offset for the requested start (09:00Z is 11:00 local)', () => {
    const slot = findSlot({ ...ctxFor(101), start: start('2026-10-23T09:00:00Z') });
    expect(slot && toApiIso(slot.start)).toBe('2026-10-23T11:00:00+02:00');
    expect(slot?.staffIds).toEqual([1002]);
  });
});
