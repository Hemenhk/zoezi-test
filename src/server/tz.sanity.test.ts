import { expect, it } from 'vitest';

it('runs under America/New_York so time-zone bugs surface', () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
});
