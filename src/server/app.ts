import Fastify, { type FastifyInstance } from 'fastify';
import type { DateTime } from 'luxon';
import { DATA_PATH, PERSIST_PATH, getNow } from './config';

export interface BuildAppOptions {
  logger?: boolean;
  now?: () => DateTime;
  dataPath?: string;
  persistPath?: string | null;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  // dataPath, persistPath and now are wired in by task 1.1 and later.
  const { logger = false } = options;
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}

export const defaultOptions = { now: getNow, dataPath: DATA_PATH, persistPath: PERSIST_PATH };
