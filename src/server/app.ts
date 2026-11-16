import Fastify, { type FastifyInstance } from 'fastify';
import type { DateTime } from 'luxon';
import { DATA_PATH, PERSIST_PATH, getNow } from './config';
import { loadData, type DataModel } from './data/load';
import { BookingStore } from './data/store';
import { IdempotencyKeys } from './domain/booking';
import { registerErrorHandling } from './errors';
import { bookingRoutes } from './routes/bookings';
import { metaRoutes } from './routes/meta';
import { searchRoutes } from './routes/search';

declare module 'fastify' {
  interface FastifyInstance {
    model: DataModel;
    store: BookingStore;
    now: () => DateTime;
    idempotency: IdempotencyKeys;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
  now?: () => DateTime;
  dataPath?: string;
  persistPath?: string | null;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  // persistPath defaults to null (memory only) so a test that forgets it can't write to .data/.
  const { logger = false, now = getNow, dataPath = DATA_PATH, persistPath = null } = options;
  const app = Fastify({
    logger: logger
      ? {
          serializers: {
            // Method and path only. The query string holds lat/lng, a precise location (rule 8).
            req: (req) => ({ method: req.method, url: (req.url ?? '').split('?')[0] }),
          },
        }
      : false,
  });
  registerErrorHandling(app);

  const model = loadData(dataPath);
  const store = new BookingStore(model.bookings, persistPath);
  app.decorate('model', model);
  app.decorate('store', store);
  app.decorate('now', now);
  app.decorate('idempotency', new IdempotencyKeys());

  // One summary line: counts per code. Warnings hold ids only, so no personal data is logged.
  const codes: Record<string, number> = {};
  for (const w of model.warnings) codes[w.code] = (codes[w.code] ?? 0) + 1;
  app.log.warn({ count: model.warnings.length, codes }, 'data.json quirks found at startup');

  app.get('/api/health', async () => ({ ok: true }));
  metaRoutes(app);
  searchRoutes(app);
  bookingRoutes(app);

  return app;
}

export const defaultOptions = { now: getNow, dataPath: DATA_PATH, persistPath: PERSIST_PATH };
