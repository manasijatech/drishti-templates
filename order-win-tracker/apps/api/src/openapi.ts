const jsonResponse = (schema: object, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const errorResponse = (description: string) =>
  jsonResponse({ $ref: "#/components/schemas/Error" }, description);

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Order Win Tracker API",
    version: "1.0.0",
    description: "Track Indian listed-company order-win announcements from Drishti.",
  },
  servers: [{ url: "/", description: "Current server" }],
  paths: {
    "/health/live": {
      get: {
        summary: "Check whether the API process is alive",
        description:
          "Returns immediately when the HTTP process is running. This check does not verify MongoDB or Drishti connectivity and is intended for container liveness probes.",
        responses: { "200": { description: "The API process is running" } },
      },
    },
    "/health/ready": {
      get: {
        summary: "Check whether the API is ready to serve requests",
        description:
          "Reports whether the API has an active MongoDB connection. Use this endpoint for readiness probes before routing traffic to the service.",
        responses: {
          "200": { description: "MongoDB is connected and the API is ready" },
          "503": { description: "MongoDB is not connected and the API is not ready" },
        },
      },
    },
    "/api/v1/order-wins": {
      get: {
        summary: "List stored order-win announcements",
        description:
          "Returns order-win announcements already stored in MongoDB, newest first. Results use cursor pagination and can optionally be limited to one market symbol. This endpoint does not call Drishti.",
        parameters: [
          {
            name: "symbol",
            in: "query",
            description: "Return only records for this symbol. Matching is case-insensitive.",
            schema: { type: "string", minLength: 1 },
          },
          {
            name: "cursor",
            in: "query",
            description:
              "Opaque `nextCursor` from the previous response. Omit it to read the first page.",
            schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
          },
          {
            name: "limit",
            in: "query",
            description: "Maximum records to return. Defaults to 25 and cannot exceed 100.",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        responses: {
          "200": jsonResponse(
            { $ref: "#/components/schemas/OrderWinListResponse" },
            "Cursor-paginated order wins",
          ),
          "400": errorResponse("Invalid query"),
          "429": errorResponse("Rate limit exceeded"),
        },
      },
    },
    "/api/v1/order-win-ingestions": {
      post: {
        summary: "Fetch and store order-win announcements",
        description:
          "Runs a synchronous ingestion from Drishti for the requested UTC window. The current tracking configuration limits upstream results when symbols are configured; all-market mode requests every symbol. Records are inserted, updated, or marked unchanged idempotently, and the response contains run counters. Only one ingestion can run at a time.",
        requestBody: {
          required: true,
          description:
            "Optional UTC date-time bounds. If omitted, `to` is now and `from` uses the configured lookback period.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: {
                    type: "string",
                    format: "date-time",
                    description:
                      "Inclusive start of the ingestion window in an offset-aware format.",
                  },
                  to: {
                    type: "string",
                    format: "date-time",
                    description: "Inclusive end of the ingestion window in an offset-aware format.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": jsonResponse(
            { $ref: "#/components/schemas/IngestionRunResponse" },
            "Completed ingestion run",
          ),
          "400": errorResponse("Invalid request"),
          "409": errorResponse("Ingestion already running"),
          "422": errorResponse("Invalid time window"),
          "429": errorResponse("Rate limit exceeded"),
          "502": errorResponse("Drishti unavailable"),
        },
      },
    },
    "/api/v1/ingestion-runs/{id}": {
      get: {
        summary: "Get one ingestion run",
        description:
          "Returns the persisted status, requested window, processing counters, timestamps, and public error details for a previous ingestion run.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "MongoDB identifier returned by the ingestion endpoint.",
            schema: { type: "string", minLength: 1 },
          },
        ],
        responses: {
          "200": jsonResponse(
            { $ref: "#/components/schemas/IngestionRunResponse" },
            "Ingestion run",
          ),
          "404": errorResponse("Not found"),
          "429": errorResponse("Rate limit exceeded"),
        },
      },
    },
    "/api/v1/tracking-configurations/current": {
      get: {
        summary: "Get the current symbol tracking configuration",
        description:
          "Returns the singleton configuration used by future ingestion runs. `mode: all` with an empty `symbols` array is the default and means the entire market is tracked.",
        responses: {
          "200": jsonResponse(
            { $ref: "#/components/schemas/TrackingConfigurationResponse" },
            "Current configuration; mode all is the default",
          ),
          "429": errorResponse("Rate limit exceeded"),
        },
      },
      put: {
        summary: "Replace the current tracked-symbol list",
        description:
          "Atomically replaces the singleton symbol configuration used by future ingestion runs. Symbols are trimmed, uppercased, deduplicated, and sorted. Send an empty array to restore all-market mode. Existing stored order wins are not deleted.",
        requestBody: {
          required: true,
          description: "The complete replacement list, not a partial update.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["symbols"],
                properties: {
                  symbols: {
                    type: "array",
                    maxItems: 500,
                    description:
                      "Market symbols to track. An empty list means all symbols in the market.",
                    items: { type: "string", minLength: 1, maxLength: 64 },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse(
            { $ref: "#/components/schemas/TrackingConfigurationResponse" },
            "Updated configuration",
          ),
          "400": errorResponse("Invalid request"),
          "429": errorResponse("Rate limit exceeded"),
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: { code: { type: "string" }, message: { type: "string" } },
          },
        },
      },
      TrackingConfigurationResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "object",
            required: ["mode", "symbols"],
            properties: {
              mode: { type: "string", enum: ["all", "symbols"] },
              symbols: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      IngestionRunResponse: {
        type: "object",
        required: ["data"],
        properties: { data: { $ref: "#/components/schemas/IngestionRun" } },
      },
      IngestionRun: {
        type: "object",
        required: [
          "id",
          "status",
          "trigger",
          "window",
          "pagesFetched",
          "recordsFetched",
          "recordsInserted",
          "recordsUpdated",
          "recordsUnchanged",
          "recordsRejected",
          "startedAt",
          "completedAt",
          "error",
        ],
        properties: {
          id: { type: "string" },
          status: {
            type: "string",
            enum: ["running", "succeeded", "partially_succeeded", "failed"],
          },
          trigger: { type: "string", enum: ["manual", "scheduled"] },
          window: {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
            },
          },
          pagesFetched: { type: "integer" },
          recordsFetched: { type: "integer" },
          recordsInserted: { type: "integer" },
          recordsUpdated: { type: "integer" },
          recordsUnchanged: { type: "integer" },
          recordsRejected: { type: "integer" },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          error: { oneOf: [{ $ref: "#/components/schemas/ErrorDetail" }, { type: "null" }] },
        },
      },
      ErrorDetail: {
        type: "object",
        required: ["code", "message"],
        properties: { code: { type: "string" }, message: { type: "string" } },
      },
      OrderWinListResponse: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/OrderWin" } },
          meta: {
            type: "object",
            required: ["nextCursor"],
            properties: { nextCursor: { type: ["string", "null"] } },
          },
        },
      },
      OrderWin: {
        type: "object",
        required: [
          "id",
          "source",
          "sourceAnnouncementId",
          "symbol",
          "companyName",
          "announcedAt",
          "category",
          "summary",
          "longSummary",
          "relatedCategories",
          "important",
          "extractedInformation",
          "sourceImageUrl",
          "contentHash",
          "firstSeenAt",
          "lastSeenAt",
          "schemaVersion",
        ],
        properties: {
          id: { type: "string" },
          source: { type: "string", enum: ["drishti"] },
          sourceAnnouncementId: { type: "string" },
          symbol: { type: "string" },
          companyName: { type: ["string", "null"] },
          announcedAt: { type: ["string", "null"], format: "date-time" },
          category: { type: "string", enum: ["Award/Receipt of Order"] },
          summary: { type: ["string", "null"] },
          longSummary: { type: ["string", "null"] },
          relatedCategories: { type: "array", items: { type: "string" } },
          important: { type: ["boolean", "null"] },
          extractedInformation: {},
          sourceImageUrl: { type: ["string", "null"], format: "uri" },
          contentHash: { type: "string" },
          firstSeenAt: { type: "string", format: "date-time" },
          lastSeenAt: { type: "string", format: "date-time" },
          schemaVersion: { type: "integer", enum: [1] },
        },
      },
    },
  },
} as const;
