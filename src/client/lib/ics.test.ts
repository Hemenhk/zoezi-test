import { describe, expect, it } from 'vitest';
import type { BookingDto } from '@shared/schemas';
import { buildIcs } from './ics';

// Expected values are worked out by hand. The suite runs under TZ=America/New_York.
// 2026-10-23 is still summer time in Stockholm (UTC+2; it ends on 25 Oct), so 13:00+02:00 is 11:00Z.
const booking: BookingDto = {
  id: 'abcd1234-0000-4000-8000-000000000000',
  status: 'confirmed',
  customerName: 'Anna Berg',
  start: '2026-10-23T13:00:00+02:00',
  end: '2026-10-23T14:00:00+02:00',
  venue: { id: 7, name: 'Salong Nord' },
  service: { id: 3, name: 'Klippning', durationMinutes: 60, priceSek: 450 },
  staff: { id: 1, name: 'Eva' },
  createdAt: '2026-10-22T08:00:00+02:00',
};

describe('buildIcs', () => {
  const lines = buildIcs(booking).split('\r\n');

  it('writes start and end in UTC', () => {
    expect(lines).toContain('DTSTART:20261023T110000Z');
    // A 60-minute service starting 11:00Z ends 12:00Z.
    expect(lines).toContain('DTEND:20261023T120000Z');
    expect(lines).toContain('DTSTAMP:20261022T060000Z');
  });

  it('has the calendar structure, identity and text fields', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('UID:abcd1234-0000-4000-8000-000000000000@booking.local');
    expect(lines).toContain('SUMMARY:Klippning at Salong Nord');
    expect(lines).toContain('LOCATION:Salong Nord');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.filter((l) => l === 'END:VEVENT')).toHaveLength(1);
  });

  it('uses CRLF only and ends with a line break', () => {
    const text = buildIcs(booking);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('escapes commas, semicolons and backslashes in text', () => {
    const text = buildIcs({ ...booking, venue: { id: 7, name: 'A, B; C\\D' } });
    expect(text).toContain('LOCATION:A\\, B\\; C\\\\D\r\n');
    expect(text).toContain('SUMMARY:Klippning at A\\, B\\; C\\\\D\r\n');
  });

  it('folds lines longer than 75 octets', () => {
    const text = buildIcs({ ...booking, venue: { id: 7, name: 'x'.repeat(100) } });
    // The SUMMARY line is well over 75 octets, so its tail continues on a line that starts with a space.
    expect(text).toMatch(/SUMMARY:Klippning at x+\r\n x+\r\n/);
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
