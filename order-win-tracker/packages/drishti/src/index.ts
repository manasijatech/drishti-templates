import { drishtiAnnouncementPageSchema, ORDER_WIN_CATEGORY } from "@order-win/contracts";
import type { AnnouncementPageRequest, AnnouncementSource } from "@order-win/core";
import { DrishtiApiError, DrishtiClient } from "drishti-sdk";

export type AnnouncementsRequest = {
  readonly categories?: string[];
  readonly detailed?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly symbols?: string[];
};

export type AnnouncementsClient = {
  getAnnouncements(params: AnnouncementsRequest): Promise<unknown>;
};

export class DrishtiSourceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DrishtiSourceError";
  }
}

export class DrishtiAnnouncementSource implements AnnouncementSource {
  constructor(private readonly client: AnnouncementsClient) {}

  async fetchOrderWins(request: AnnouncementPageRequest) {
    try {
      const response: unknown = await this.client.getAnnouncements({
        categories: [ORDER_WIN_CATEGORY],
        detailed: true,
        from: request.from.toISOString(),
        to: request.to.toISOString(),
        page: request.page,
        limit: request.limit,
        ...(request.symbols ? { symbols: [...request.symbols] } : {}),
      });
      const parsed = drishtiAnnouncementPageSchema.parse(response);
      return { data: parsed.data, hasNext: parsed.has_next };
    } catch (error) {
      if (error instanceof DrishtiApiError) {
        throw new DrishtiSourceError(
          `Drishti request failed with status ${error.statusCode}`,
          error.statusCode,
          { cause: error },
        );
      }
      throw new DrishtiSourceError("Drishti returned an invalid response", null, { cause: error });
    }
  }
}

export function createDrishtiAnnouncementSource(options: {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}) {
  const fetchWithTimeout: typeof fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      }),
    { preconnect: fetch.preconnect },
  );
  const client = new DrishtiClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetchImpl: fetchWithTimeout,
    retry: {
      maxRetries: 3,
      initialDelayMs: 250,
      maxDelayMs: 4_000,
      multiplier: 2,
      retryOnStatuses: [408, 429, 500, 502, 503, 504],
    },
  });
  return new DrishtiAnnouncementSource(client);
}
