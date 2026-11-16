import { DateTime, type WeekdayNumbers } from 'luxon';

// Every venue is in Stockholm (D3). All time logic goes through Luxon in this zone,
// never through JS Date methods that depend on the machine's zone (CLAUDE.md rule 4).
export const ZONE = 'Europe/Stockholm';

export const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_NAMES)[number];

/** Luxon weekday (1 = Monday ... 7 = Sunday) to the keys used in data.json. */
export const WEEKDAY_KEYS: Record<WeekdayNumbers, WeekdayKey> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
  7: 'sun',
};

export function weekdayKey(dt: DateTime): WeekdayKey {
  const key = WEEKDAY_KEYS[dt.weekday as WeekdayNumbers];
  if (!key) throw new Error('Cannot get the weekday of an invalid DateTime');
  return key;
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHm(hm: string): { hour: number; minute: number } {
  const m = HM.exec(hm);
  if (!m) throw new Error(`Invalid time "${hm}", expected HH:mm`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Parses an ISO 8601 string with any offset ("Z", "+01:00", ...) as an instant and
 * expresses it in the venue zone. May return an invalid DateTime; callers check isValid.
 */
export function parseInstant(iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: true }).setZone(ZONE);
}

/** ISO 8601 in the venue zone, with offset and without milliseconds. */
export function toApiIso(dt: DateTime): string {
  const iso = dt.setZone(ZONE).set({ millisecond: 0 }).toISO({ suppressMilliseconds: true });
  if (iso === null) throw new Error('Cannot format an invalid DateTime');
  return iso;
}

/** The local calendar date ("YYYY-MM-DD") of an instant, in the venue zone. */
export function localDateString(dt: DateTime): string {
  const date = dt.setZone(ZONE).toISODate();
  if (date === null) throw new Error('Cannot format an invalid DateTime');
  return date;
}

/** A wall-clock time at the venue: date "YYYY-MM-DD" and time "HH:mm". */
export function localDateTime(date: string, hm: string): DateTime {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  const { hour, minute } = parseHm(hm);
  const dt = DateTime.fromObject(
    { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour, minute },
    { zone: ZONE },
  );
  if (!dt.isValid) throw new Error(`Invalid local time ${date} ${hm}: ${dt.invalidExplanation}`);
  return dt;
}
