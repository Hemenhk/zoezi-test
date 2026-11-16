import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { parseInstant, toApiIso } from '../domain/time';
import { makeBooking, type Booking } from './load';

const persistedSchema = z.array(
  z.object({
    id: z.string().min(1),
    staffId: z.number().int(),
    serviceId: z.number().int(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    status: z.string(),
    customerName: z.string().nullable(),
    createdAt: z.string().nullable(),
  }),
);

function byStart(a: Booking, b: Booking): number {
  return a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id);
}

/**
 * Holds the bookings from data.json (never written back) plus the ones created at runtime.
 * Runtime bookings are persisted synchronously, so the check/insert/persist sequence in the
 * booking code can run without an await (D15).
 */
export class BookingStore {
  private readonly byStaff = new Map<number, readonly Booking[]>();
  private runtime: Booking[] = [];

  constructor(
    seed: readonly Booking[],
    private readonly persistPath: string | null = null,
  ) {
    for (const booking of seed) this.index(booking);
    if (persistPath !== null && existsSync(persistPath)) {
      for (const booking of this.readPersisted(persistPath)) {
        this.runtime.push(booking);
        this.index(booking);
      }
    }
  }

  /** All bookings for a staff member, cancelled ones included, sorted by start. */
  listForStaff(staffId: number): readonly Booking[] {
    return this.byStaff.get(staffId) ?? [];
  }

  /**
   * A booking created at runtime (through the API), or undefined. The data.json bookings are
   * deliberately not returned: they have no customer and were never made through this API.
   */
  getRuntime(id: string): Booking | undefined {
    return this.runtime.find((b) => b.id === id);
  }

  /** Synchronous on purpose. If persisting throws, nothing has been added. */
  add(booking: Booking): void {
    const nextRuntime = [...this.runtime, booking];
    this.persist(nextRuntime);
    this.runtime = nextRuntime;
    this.index(booking);
  }

  private index(booking: Booking): void {
    const list = [...(this.byStaff.get(booking.staffId) ?? []), booking].sort(byStart);
    this.byStaff.set(booking.staffId, list);
  }

  private persist(runtime: readonly Booking[]): void {
    if (this.persistPath === null) return;
    const records = runtime.map((b) => ({
      id: b.id,
      staffId: b.staffId,
      serviceId: b.serviceId,
      start: toApiIso(b.start),
      end: toApiIso(b.end),
      status: b.status,
      customerName: b.customerName,
      createdAt: b.createdAt,
    }));
    mkdirSync(dirname(this.persistPath), { recursive: true });
    // Write then rename, so a crash mid-write cannot leave a truncated file behind.
    const tmp = `${this.persistPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(records, null, 2));
    renameSync(tmp, this.persistPath);
  }

  private readPersisted(path: string): Booking[] {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new Error(`Cannot read saved bookings from ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const parsed = persistedSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Saved bookings file ${path} has an unexpected shape; fix or delete it`);
    }
    return parsed.data.map((r) =>
      makeBooking({ ...r, start: parseInstant(r.start), end: parseInstant(r.end) }),
    );
  }
}
