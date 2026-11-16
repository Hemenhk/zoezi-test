import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchQuerySchema } from '@shared/schemas';
import { SearchError, search } from '../domain/search';
import { sendError } from '../errors';

export function searchRoutes(app: FastifyInstance): void {
  app.get('/api/search', async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid search parameters', {
        details: z.flattenError(parsed.error),
      });
    }
    try {
      // app.now() on every request: never captured at startup, or the clock would freeze.
      return search(parsed.data, app.model, app.store, app.now());
    } catch (err) {
      if (err instanceof SearchError && err.code === 'RANGE_IN_PAST') {
        return sendError(reply, 400, 'RANGE_IN_PAST', err.message);
      }
      throw err; // the error handler turns it into a 500
    }
  });
}
