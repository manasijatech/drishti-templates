const errorResponse = {
	description: "Request failed",
	content: {
		"application/json": {
			schema: { $ref: "#/components/schemas/Error" },
		},
	},
} as const;

export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "Drishti Corporate Action Lifecycle API",
		version: "1.0.0",
		description:
			"Track corporate actions for watched Indian-listed companies, beginning with six core lifecycle types. Drishti WebSocket deliveries provide continuous updates; REST is reserved for historical backfill, reconnect recovery, and verification. Every displayed fact retains a link to its original exchange filing.",
	},
	servers: [
		{
			url: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
			description: "Lifecycle API",
		},
	],
	tags: [
		{
			name: "System",
			description: "API readiness and Drishti announcement-stream status.",
		},
		{
			name: "Symbols",
			description:
				"Manage the company-symbol watchlist and synchronize announcement history.",
		},
		{
			name: "Lifecycles",
			description:
				"Read corporate-action events reconstructed from related announcements.",
		},
		{
			name: "Sources",
			description:
				"Retrieve the original exchange filings referenced by lifecycle data.",
		},
	],
	paths: {
		"/health": {
			get: {
				tags: ["System"],
				summary: "Check API and stream status",
				description:
					"Returns API readiness and the current Drishti WebSocket connection state. Use it for service health checks and to determine whether live announcement updates are connected.",
				responses: {
					"200": {
						description: "API is ready",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Health" },
							},
						},
					},
				},
			},
		},
		"/api/symbols": {
			get: {
				tags: ["Symbols"],
				summary: "List watched symbols",
				description:
					"Returns every company symbol currently being monitored, including its resolved company name and most recent synchronization result.",
				responses: {
					"200": {
						description: "Watchlist",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["data"],
									properties: {
										data: {
											type: "array",
											items: { $ref: "#/components/schemas/Symbol" },
										},
									},
								},
							},
						},
					},
				},
			},
			post: {
				tags: ["Symbols"],
				summary: "Add and synchronize a symbol",
				description:
					"Validates the symbol with Drishti, adds it to the watchlist, imports its announcement history, rebuilds its corporate-action lifecycles, and refreshes the live subscription. Adding an existing symbol safely synchronizes it again.",
				requestBody: {
					description:
						"An NSE or BSE company symbol. Input is trimmed and normalized to uppercase.",
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["symbol"],
								properties: {
									symbol: {
										type: "string",
										description: "Listed-company symbol to monitor.",
										example: "TCS",
									},
								},
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Symbol added",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: { $ref: "#/components/schemas/Symbol" },
									},
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"502": errorResponse,
					"503": errorResponse,
				},
			},
		},
		"/api/symbols/{symbol}": {
			delete: {
				tags: ["Symbols"],
				summary: "Stop monitoring a symbol",
				description:
					"Stops monitoring the symbol and hides its reconstructed lifecycles. Cached source announcements remain available for audit. This does not alter upstream exchange or Drishti data.",
				parameters: [{ $ref: "#/components/parameters/SymbolPath" }],
				responses: {
					"204": { description: "Symbol removed" },
					"404": errorResponse,
				},
			},
		},
		"/api/symbols/{symbol}/sync": {
			post: {
				tags: ["Symbols"],
				summary: "Run a REST catch-up for a watched symbol",
				description:
					"Runs a full historical backfill when the symbol has not completed one; otherwise fetches only the persisted watermark overlap through the current time. Normal updates arrive through the live stream.",
				parameters: [{ $ref: "#/components/parameters/SymbolPath" }],
				responses: {
					"200": {
						description: "Reconstructed lifecycles",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: {
											type: "array",
											items: { $ref: "#/components/schemas/Lifecycle" },
										},
									},
								},
							},
						},
					},
					"404": errorResponse,
					"502": errorResponse,
					"503": errorResponse,
				},
			},
		},
		"/api/lifecycles": {
			get: {
				tags: ["Lifecycles"],
				summary: "List reconstructed lifecycles",
				description:
					"Returns lifecycles across all watched symbols together with dashboard totals and the current live-stream state. Each lifecycle includes stages, extracted terms, meaningful changes, and source-announcement references.",
				responses: {
					"200": {
						description: "Lifecycle list and summary",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/LifecycleList" },
							},
						},
					},
				},
			},
		},
		"/api/lifecycles/{id}": {
			get: {
				tags: ["Lifecycles"],
				summary: "Get one lifecycle",
				description:
					"Returns the complete reconstructed lifecycle identified by its stable lifecycle ID, including provenance for its dates, terms, changes, and source filings.",
				parameters: [{ $ref: "#/components/parameters/IdPath" }],
				responses: {
					"200": {
						description: "Lifecycle",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: { $ref: "#/components/schemas/Lifecycle" },
									},
								},
							},
						},
					},
					"404": errorResponse,
				},
			},
		},
		"/api/announcements/{id}/source": {
			get: {
				tags: ["Sources"],
				summary: "Download the original exchange filing",
				description:
					"Proxies the original PDF for a stored announcement through this API. Upstream credentials and short-lived citation tokens are never exposed to the caller.",
				parameters: [{ $ref: "#/components/parameters/IdPath" }],
				responses: {
					"200": {
						description: "Source filing",
						content: {
							"application/pdf": {
								schema: { type: "string", format: "binary" },
							},
						},
					},
					"404": errorResponse,
					"502": errorResponse,
					"503": errorResponse,
				},
			},
		},
	},
	components: {
		parameters: {
			SymbolPath: {
				name: "symbol",
				in: "path",
				required: true,
				description: "Normalized NSE or BSE company symbol.",
				schema: { type: "string", example: "TCS" },
			},
			IdPath: {
				name: "id",
				in: "path",
				required: true,
				description:
					"Stable lifecycle ID or Drishti announcement ID, depending on the endpoint.",
				schema: { type: "string" },
			},
		},
		schemas: {
			Error: {
				type: "object",
				description: "A safe, caller-facing API error.",
				required: ["error"],
				properties: { error: { type: "string" } },
			},
			Health: {
				type: "object",
				description: "Service readiness and live announcement-stream state.",
				required: ["status", "stream"],
				properties: {
					status: { type: "string", const: "ok" },
					stream: {
						type: "string",
						enum: [
							"connecting",
							"connected",
							"backfilling",
							"degraded",
							"disconnected",
							"not_configured",
						],
					},
				},
			},
			Symbol: {
				type: "object",
				description:
					"A listed company currently stored in the lifecycle watchlist.",
				required: ["symbol", "companyName", "addedAt"],
				properties: {
					symbol: { type: "string" },
					companyName: { type: "string" },
					addedAt: { type: "string", format: "date-time" },
					lastSyncedAt: { type: "string", format: "date-time" },
					lastAnnouncementAt: { type: "string", format: "date-time" },
					backfillCompletedAt: { type: "string", format: "date-time" },
					syncStatus: {
						type: "string",
						enum: ["pending", "backfilling", "live", "degraded"],
					},
					syncError: { type: "string" },
				},
			},
			Lifecycle: {
				type: "object",
				description:
					"A corporate action reconstructed from one or more related exchange announcements.",
				required: [
					"id",
					"symbol",
					"companyName",
					"actionType",
					"status",
					"state",
					"createdAt",
					"updatedAt",
					"terms",
					"stages",
					"changes",
					"announcements",
				],
				properties: {
					id: { type: "string" },
					symbol: { type: "string" },
					companyName: { type: "string" },
					actionType: { type: "string" },
					status: { type: "string" },
					state: {
						type: "string",
						enum: ["active", "completed", "cancelled", "needs_review"],
					},
					createdAt: { type: "string", format: "date-time" },
					updatedAt: { type: "string", format: "date-time" },
					terms: { type: "array", items: { type: "object" } },
					stages: { type: "array", items: { type: "object" } },
					changes: { type: "array", items: { type: "object" } },
					announcements: { type: "array", items: { type: "object" } },
					nextExpectedStage: { type: "string" },
					nextExpectedDate: { type: "string" },
				},
			},
			LifecycleList: {
				type: "object",
				description:
					"All reconstructed lifecycles, dashboard summary counts, and live-stream state.",
				required: ["data", "summary", "stream", "streamDetails"],
				properties: {
					data: {
						type: "array",
						items: { $ref: "#/components/schemas/Lifecycle" },
					},
					summary: {
						type: "object",
						additionalProperties: { type: "integer" },
					},
					stream: {
						type: "string",
						enum: [
							"connecting",
							"connected",
							"backfilling",
							"degraded",
							"disconnected",
							"not_configured",
						],
					},
					streamDetails: { type: "object" },
				},
			},
		},
	},
} as const;
