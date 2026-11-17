// Calendar-date helpers for "YYYY-MM-DD" strings. They work on the date parts with Date.UTC, so
// the browser's time zone never matters. The client does not use Luxon (CLAUDE.md).

const DAY_MS = 86_400_000;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

/** `date` plus `days` calendar days, as "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The venue-local calendar date of an API timestamp. The API always returns Stockholm time with
 * its offset, so the date is the first ten characters.
 */
export function localDateOf(apiIso: string): string {
  return apiIso.slice(0, 10);
}

// --- Display helpers (Intl only). Everything is shown in the venue's time, whatever the browser's zone. ---

const ZONE = 'Europe/Stockholm';

const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short' });
const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const priceFmt = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const kmFmt = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** An instant for a local calendar date. Noon UTC is the same calendar day in Stockholm all year. */
function instantOfDate(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Fri" for a "YYYY-MM-DD" date. */
export function formatWeekday(date: string): string {
  return weekdayFmt.format(instantOfDate(date));
}

/** "23 Oct" for a "YYYY-MM-DD" date. */
export function formatDayMonth(date: string): string {
  return dayMonthFmt.format(instantOfDate(date));
}

/** "Fri 23 Oct" for a "YYYY-MM-DD" date. */
export function formatDayLabel(date: string): string {
  return `${formatWeekday(date)} ${formatDayMonth(date)}`;
}

/** "09:00" (24-hour) for an API timestamp. */
export function formatTime(apiIso: string): string {
  return timeFmt.format(new Date(apiIso));
}

/** "Fri 23 Oct, 09:00" for an API timestamp. */
export function formatDayTime(apiIso: string): string {
  return `${formatDayLabel(localDateOf(apiIso))}, ${formatTime(apiIso)}`;
}

/**
 * Accessible name for a slot button, e.g. "Fri 23 Oct, 09:00, Klassisk massage with Anna".
 * `chosenStaffId` is the staff filter (null = any). The staff part names the person when one is
 * chosen or only one can take the slot, says "any staff" when several can, and is left out when unknown.
 */
export function formatSlotLabel(
  slot: { start: string; staffIds: number[] },
  serviceName: string,
  staff: { id: number; name: string }[],
  chosenStaffId: number | null,
): string {
  const nameOf = (id: number) => staff.find((s) => s.id === id)?.name;
  const who =
    chosenStaffId !== null
      ? nameOf(chosenStaffId)
      : slot.staffIds.length > 1
        ? 'any staff'
        : slot.staffIds[0] !== undefined
          ? nameOf(slot.staffIds[0])
          : undefined;
  return `${formatDayTime(slot.start)}, ${serviceName}${who ? ` with ${who}` : ''}`;
}

/** The venue-local hour (0-23) of an API timestamp. */
export function localHour(apiIso: string): number {
  return Number(formatTime(apiIso).slice(0, 2));
}

/** "795 kr" */
export function formatPrice(sek: number): string {
  return priceFmt.format(sek);
}

/** "850 m" below 1 km, otherwise "1.2 km". */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${kmFmt.format(meters / 1000)} km`;
}

/** "60 min" */
export function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

/** Epoch milliseconds of an API timestamp, for comparing instants (never compare the strings). */
export function epochOf(apiIso: string): number {
  return new Date(apiIso).getTime();
}

/** "23–29 Oct" within a month, "28 Oct – 3 Nov" across months, "23 Oct" for a single day. */
export function formatDateRange(from: string, to: string): string {
  if (from === to) return formatDayMonth(from);
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  if (fy === ty && fm === tm) {
    const [, , fd] = parts(from);
    return `${fd}–${formatDayMonth(to)}`;
  }
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}
