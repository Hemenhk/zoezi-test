import { describe, expect, it } from 'vitest';
import { formatDateRange, formatDayLabel, formatDayTime, formatDistance, formatTime, localHour } from './format';

// Expected values are worked out by hand. The suite runs under TZ=America/New_York.
describe('client formatting', () => {
  it('shows venue time, not the machine time', () => {
    expect(formatTime('2026-10-23T09:00:00+02:00')).toBe('09:00');
    // 09:00Z on 26 Oct is 10:00 in Stockholm (UTC+1).
    expect(formatTime('2026-10-26T09:00:00Z')).toBe('10:00');
    expect(localHour('2026-10-26T09:00:00Z')).toBe(10);
    expect(formatDayTime('2026-10-23T09:00:00+02:00')).toBe('Fri 23 Oct, 09:00');
  });

  it('labels a calendar date without drifting a day', () => {
    expect(formatDayLabel('2026-10-23')).toBe('Fri 23 Oct');
    expect(formatDayLabel('2026-10-25')).toBe('Sun 25 Oct'); // DST change day
  });

  it('formats distance', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1234)).toBe('1.2 km');
  });

  it('formats a date range for the summary bar', () => {
    expect(formatDateRange('2026-10-23', '2026-10-29')).toBe('23–29 Oct');
    expect(formatDateRange('2026-10-23', '2026-10-23')).toBe('23 Oct');
    expect(formatDateRange('2026-10-28', '2026-11-03')).toBe('28 Oct – 3 Nov');
  });
});
