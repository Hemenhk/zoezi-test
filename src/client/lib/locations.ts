// Preset search origins. Every venue in data.json is in Stockholm, so these always give useful
// results, whatever the reviewer's real location is.

export interface LocationPreset {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export const LOCATION_PRESETS: readonly LocationPreset[] = [
  { key: 'medborgarplatsen', name: 'Medborgarplatsen', lat: 59.3143, lng: 18.0736 },
  { key: 't-centralen', name: 'T-Centralen', lat: 59.3313, lng: 18.0597 },
  { key: 'fridhemsplan', name: 'Fridhemsplan', lat: 59.3322, lng: 18.0296 },
  { key: 'ostermalmstorg', name: 'Östermalmstorg', lat: 59.3349, lng: 18.079 },
];

export const DEFAULT_PRESET: LocationPreset = LOCATION_PRESETS[0] as LocationPreset;

/** The preset at these coordinates, if any (a "Use my location" fix will not match one). */
export function findPreset(lat: number, lng: number): LocationPreset | undefined {
  return LOCATION_PRESETS.find((p) => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lng - lng) < 1e-6);
}
