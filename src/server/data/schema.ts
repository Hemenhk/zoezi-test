import { z } from 'zod';
import { WEEKDAY_NAMES, parseHm } from '../domain/time';

// Schemas for the raw data.json. Lenient exactly where the data is (Q1, Q7):
// position may be null, venue days may be null, staff may omit days, breaks default to [].

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');

function minutes(value: string): number {
  const { hour, minute } = parseHm(value);
  return hour * 60 + minute;
}

const hoursRange = z
  .tuple([hm, hm])
  .refine(([start, end]) => minutes(start) < minutes(end), 'start must be before end');

/** A missing day and a null day both mean closed (D5, Q7). */
const weekHours = z.partialRecord(z.enum(WEEKDAY_NAMES), hoursRange.nullable());

const position = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const serviceBase = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  priceSek: z.number().nonnegative(),
});

const breakSchema = z
  .object({
    days: z.array(z.enum(WEEKDAY_NAMES)),
    start: hm,
    end: hm,
  })
  .refine((b) => minutes(b.start) < minutes(b.end), 'start must be before end');

const staffBase = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  serviceIds: z.array(z.number().int()),
  workingHours: weekHours,
  breaks: z.array(breakSchema).default([]),
});

const isoWithOffset = z.iso.datetime({ offset: true });

const bookingBase = z.object({
  id: z.string().min(1),
  staffId: z.number().int(),
  serviceId: z.number().int(),
  start: isoWithOffset,
  end: isoWithOffset,
  // Deliberately a plain string: unknown statuses must still load, and they block (D6).
  status: z.string(),
  // Not in data.json (Q8); the field exists so the same schema can read runtime bookings.
  customerName: z.string().optional(),
});

/** The file itself: venues and bookings are validated one by one afterwards. */
export const rawFileSchema = z.object({
  venues: z.array(z.unknown()),
  bookings: z.array(z.unknown()),
});

/** A venue without its services and staff, which are validated individually. */
export const rawVenueSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  position: position.nullish(),
  openingHours: weekHours,
  services: z.array(z.unknown()),
  staff: z.array(z.unknown()),
});

export const rawServiceSchema = serviceBase;
export const rawStaffSchema = staffBase;
export const rawBookingSchema = bookingBase;

export type WeekHours = z.infer<typeof weekHours>;
export type Position = z.infer<typeof position>;
export type Service = z.infer<typeof rawServiceSchema>;
export type Staff = z.infer<typeof rawStaffSchema>;
export type RawBooking = z.infer<typeof rawBookingSchema>;
