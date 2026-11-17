import type { BookingDto } from '@shared/schemas';

const CRLF = '\r\n';
const encoder = new TextEncoder();

/** An ISO 8601 string with an offset to the iCalendar UTC form, YYYYMMDDTHHMMSSZ. Uses epoch time only. */
function toIcsUtc(apiIso: string): string {
  return new Date(apiIso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** RFC 5545 TEXT escaping: backslash first, then semicolon, comma and line breaks. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 3.1) without splitting a character. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(CRLF + ' ');
}

/** One VEVENT in a VCALENDAR 2.0. DTSTAMP is the booking's creation time, so the output is deterministic. */
export function buildIcs(booking: BookingDto): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Book a time//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@booking.local`,
    `DTSTAMP:${toIcsUtc(booking.createdAt)}`,
    `DTSTART:${toIcsUtc(booking.start)}`,
    `DTEND:${toIcsUtc(booking.end)}`,
    `SUMMARY:${escapeText(`${booking.service.name} at ${booking.venue.name}`)}`,
    `LOCATION:${escapeText(booking.venue.name)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Download the calendar file through a temporary link. */
export function downloadIcs(booking: BookingDto, reference: string): void {
  const blob = new Blob([buildIcs(booking)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `booking-${reference}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
