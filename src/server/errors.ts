import type { FastifyInstance, FastifyReply } from 'fastify';

// The shared error envelope from docs/PLAN.md: { error: { code, message, details?, alternatives? } }.
export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown; alternatives?: unknown[] };
}

export function errorEnvelope(
  code: string,
  message: string,
  extra: { details?: unknown; alternatives?: unknown[] } = {},
): ErrorEnvelope {
  return { error: { code, message, ...extra } };
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  extra: { details?: unknown; alternatives?: unknown[] } = {},
): FastifyReply {
  return reply.code(status).send(errorEnvelope(code, message, extra));
}

/**
 * Turns anything that escapes a route into the envelope. The body of a 500 is fixed text:
 * err.message and the stack can hold internals or personal data, so they are never sent.
 * The full error is logged server side (the logger's own serializers strip the request).
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => sendError(reply, 404, 'NOT_FOUND', 'No such route'));

  app.setErrorHandler((err: { statusCode?: number }, _req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 400 && status < 500) {
      // Framework-level client errors (malformed JSON, payload too large, ...). The wording is
      // Fastify's own, not ours, so a fixed message is used here as well.
      return sendError(reply, status, 'BAD_REQUEST', 'The request could not be processed');
    }
    app.log.error({ err }, 'unhandled error');
    return sendError(reply, 500, 'INTERNAL_ERROR', 'Something went wrong');
  });
}
