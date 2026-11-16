import { DateTime } from 'luxon';

// The only file allowed to read the real clock (CLAUDE.md rule 6).
export const PORT = Number(process.env.PORT ?? 3001);
export const HOST = process.env.HOST || '127.0.0.1';
export const DATA_PATH = new URL('../../data.json', import.meta.url).pathname;
export const PERSIST_PATH = new URL('../../.data/bookings.local.json', import.meta.url).pathname;

const pinned = process.env.NOW;
const pinnedNow = pinned ? DateTime.fromISO(pinned, { setZone: true }) : null;
if (pinnedNow && !pinnedNow.isValid) {
  throw new Error(`NOW is not a valid ISO 8601 date-time: ${pinned}`);
}

export function getNow(): DateTime {
  return pinnedNow ?? DateTime.now();
}
