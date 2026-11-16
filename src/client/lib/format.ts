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
