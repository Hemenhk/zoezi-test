import { describe, expect, it } from 'vitest';
import { suggest } from './suggest';

const names = ['Massage', 'Deep tissue massage', 'Yoga', 'Cappuccino-kurs', 'Fotmassage', 'Sköna ögon'];

describe('suggest', () => {
  it('matches by contains, ignoring case, keeping the input order', () => {
    expect(suggest(names, 'MASS')).toEqual(['Massage', 'Deep tissue massage', 'Fotmassage']);
  });

  it('ignores diacritics in both directions', () => {
    expect(suggest(names, 'skona ogon')).toEqual(['Sköna ögon']);
    expect(suggest(['Cafe', 'Café au lait'], 'café')).toEqual(['Cafe', 'Café au lait']);
  });

  it('returns nothing when nothing matches, and everything (up to the limit) for empty text', () => {
    expect(suggest(names, 'zzz')).toEqual([]);
    expect(suggest(names, '  ', 2)).toEqual(['Massage', 'Deep tissue massage']);
  });
});
