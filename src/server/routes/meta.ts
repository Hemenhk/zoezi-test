import type { FastifyInstance } from 'fastify';
import { DEFAULT_RADIUS_KM, MAX_RANGE_DAYS, type MetaResponse } from '@shared/schemas';
import { toApiIso, ZONE } from '../domain/time';

export function metaRoutes(app: FastifyInstance): void {
  app.get('/api/meta', async (): Promise<MetaResponse> => {
    // Only venues that can appear in search (Q1/D10), so autocomplete never suggests a dead end.
    const names = new Set<string>();
    for (const venue of app.model.venues) {
      if (!venue.position) continue;
      for (const service of venue.services) names.add(service.name);
    }
    return {
      now: toApiIso(app.now()), // read per request, so a pinned or real clock is never frozen
      timezone: ZONE,
      maxRangeDays: MAX_RANGE_DAYS,
      defaultRadiusKm: DEFAULT_RADIUS_KM,
      serviceNames: [...names].sort(new Intl.Collator('sv').compare),
    };
  });
}
