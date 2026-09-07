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
      get: { summary: "Liveness check", responses: { "200": { description: "Live" } } },
    },
    "/health/ready": {
      get: {
        summary: "Readiness check",
        responses: {
          "200": { description: "Ready" },
          "503": { description: "Not ready" },
        },
      },
    },
    "/api/v1/order-wins": {
      get: {
        summary: "List order wins",
        parameters: [
          { name: "symbol", in: "query", schema: { type: "string", minLength: 1 } },
          {
            name: "cursor",
            in: "query",
            schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
          },
          {
            name: "limit",
            in: "query",
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
        summary: "Ingest order wins",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: { type: "string", format: "date-time" },
                  to: { type: "string", format: "date-time" },
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
        summary: "Get an ingestion run",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } },
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
        summary: "Get tracking configuration",
        responses: {
          "200": jsonResponse(
            { $ref: "#/components/schemas/TrackingConfigurationResponse" },
            "Current configuration; mode all is the default",
          ),
          "429": errorResponse("Rate limit exceeded"),
        },
      },
      put: {
        summary: "Replace tracked symbols",
        description:
          "Symbols are normalized and deduplicated. Send an empty array to track the whole market.",
        requestBody: {
          required: true,
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
