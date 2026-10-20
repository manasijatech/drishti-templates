import { beforeAll, describe, expect, mock, test } from "bun:test";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

process.env.API_KEY_ENCRYPTION_SECRET = "test-secret";
process.env.DRISHTI_API_KEY = "server-drishti-key";

let mcpState: { active: unknown[]; failed: unknown[] } = {
	active: [],
	failed: [],
};
let lastDrishtiKey: string | undefined;

const fakeServer = {
	name: "Drishti",
	cacheToolsList: false,
	listTools: async () => [],
	callTool: async () => [],
	connect: async () => undefined,
	close: async () => undefined,
	invalidateToolsCache: async () => undefined,
};

function mockModel(text: string) {
	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t1" },
					{ type: "text-delta", id: "t1", delta: text },
					{ type: "text-end", id: "t1" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: "stop" },
						usage: {
							inputTokens: {
								total: 10,
								noCache: 10,
								cacheRead: undefined,
								cacheWrite: undefined,
							},
							outputTokens: { total: 5, text: 5, reasoning: undefined },
						},
					},
				],
			}),
		}),
	});
}

mock.module("~/providers", () => ({
	createAgentModel: () => aisdk(mockModel("Reliance closed up 2%.")),
}));

mock.module("~/mcp/registry", () => ({
	connectMarketDataServers: async (options: { drishtiApiKey?: string }) => {
		lastDrishtiKey = options.drishtiApiKey;
		return {
			...mcpState,
			errors: new Map(),
			close: async () => undefined,
		};
	},
}));

const { POST } = await import("./route");
const { encryptApiKeyServer } = await import("~/lib/server-encryption");

function chatRequest(extra: Record<string, unknown> = {}) {
	return new Request("http://local/api/chat", {
		method: "POST",
		body: JSON.stringify({
			messages: [
				{
					id: "u1",
					role: "user",
					parts: [{ type: "text", text: "What happened to Reliance today?" }],
				},
			],
			modelConfig: {
				provider: "openai",
				model: "gpt-test",
				...encryptApiKeyServer("sk-test"),
			},
			drishtiApiKey: encryptApiKeyServer("drishti-test"),
			...extra,
		}),
	});
}

describe("POST /api/chat", () => {
	beforeAll(() => {
		mcpState = { active: [], failed: [] };
	});

	test("streams the agent answer", async () => {
		mcpState = { active: [fakeServer], failed: [] };
		const res = await POST(chatRequest());
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Reliance closed up 2%.");
		expect(lastDrishtiKey).toBe("drishti-test");
	});

	test("uses the server DRISHTI_API_KEY when the user has none", async () => {
		mcpState = { active: [fakeServer], failed: [] };
		const res = await POST(chatRequest({ drishtiApiKey: undefined }));
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Reliance closed up 2%.");
		expect(lastDrishtiKey).toBe("server-drishti-key");
	});

	test("fails clearly when Drishti MCP cannot connect", async () => {
		mcpState = { active: [], failed: [{ name: "Drishti" }] };
		const res = await POST(chatRequest());
		const body = await res.text();
		expect(res.status).toBe(502);
		expect(body).not.toContain("Reliance closed up 2%.");
		expect(body).toContain("Check your Drishti API key");
	});
});
