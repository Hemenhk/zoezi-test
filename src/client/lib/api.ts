import { z } from 'zod';
import {
  metaResponseSchema,
  searchResponseSchema,
  slotSchema,
  type MetaResponse,
  type SearchQuery,
  type SearchResponse,
  type SlotDto,
} from '@shared/schemas';

/** A failed API call: a non-2xx response in the shared error envelope, or a network failure. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly alternatives: SlotDto[];
  readonly details: unknown;

  constructor(init: { code: string; message: string; status: number; alternatives?: SlotDto[]; details?: unknown }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.alternatives = init.alternatives ?? [];
    this.details = init.details;
  }
}

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    alternatives: z.array(slotSchema).optional(),
  }),
});

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<z.output<S>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection.', status: 0 });
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const envelope = errorEnvelopeSchema.safeParse(json);
    if (envelope.success) {
      const { code, message, details, alternatives } = envelope.data.error;
      throw new ApiError({ code, message, details, alternatives, status: res.status });
    }
    throw new ApiError({ code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.', status: res.status });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError({
      code: 'BAD_RESPONSE',
      message: 'The server sent a response we could not understand.',
      status: res.status,
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function fetchMeta(): Promise<MetaResponse> {
  return request('/api/meta', metaResponseSchema);
}

export function fetchSearch(params: SearchQuery): Promise<SearchResponse> {
  const qs = new URLSearchParams({
    q: params.q,
    lat: String(params.lat),
    lng: String(params.lng),
    from: params.from,
    to: params.to,
    radiusKm: String(params.radiusKm),
  });
  return request(`/api/search?${qs}`, searchResponseSchema);
}
