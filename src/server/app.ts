import Fastify, { type FastifyInstance } from 'fastify';
import type { DateTime } from 'luxon';
import { DATA_PATH, PERSIST_PATH, getNow } from './config';
import { loadData, type DataModel } from './data/load';
import { BookingStore } from './data/store';

declare module 'fastify' {
  interface FastifyInstance {
    model: DataModel;
    store: BookingStore;
    now: () => DateTime;
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
  const app = Fastify({ logger });

  const model = loadData(dataPath);
  const store = new BookingStore(model.bookings, persistPath);
  app.decorate('model', model);
  app.decorate('store', store);
  app.decorate('now', now);

  // One summary line: counts per code. Warnings hold ids only, so no personal data is logged.
  const codes: Record<string, number> = {};
  for (const w of model.warnings) codes[w.code] = (codes[w.code] ?? 0) + 1;
  app.log.warn({ count: model.warnings.length, codes }, 'data.json quirks found at startup');

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}

export const defaultOptions = { now: getNow, dataPath: DATA_PATH, persistPath: PERSIST_PATH };
