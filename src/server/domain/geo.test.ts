import { describe, expect, it } from 'vitest';
import { haversineMeters } from './geo';

describe('haversineMeters', () => {
  it('is one degree of latitude ≈ 111195 m (R = 6371 km)', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111195, -1);
    expect(Math.abs(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111195)).toBeLessThanOrEqual(10);
  });
  it('is 0 for the same point', () => {
    expect(haversineMeters({ lat: 59.3, lng: 18.07 }, { lat: 59.3, lng: 18.07 })).toBe(0);
  });
  it('is symmetric', () => {
    const a = { lat: 59.3143, lng: 18.0736 };
    const b = { lat: 59.3320299, lng: 18.0231498 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});
