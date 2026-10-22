import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MCPServerStreamableHttp } from "@openai/agents";
import { createDrishtiMcpServer } from "./drishti";

const SERVER_KEY = "server-key";
process.env.DRISHTI_API_KEY = SERVER_KEY;

function stubUpstream(key: string) {
	return spyOn(
		MCPServerStreamableHttp.prototype,
		"callToolResult",
	).mockResolvedValue({
		content: [
			{
				type: "text",
				text: `{"citation_url":"https://developers.manasija.in/v1/announcements/citations/abc123/pdf?api_key=${key}"}`,
			},
		],
	});
}

describe("Drishti MCP server", () => {
	afterEach(() => {
		(
			MCPServerStreamableHttp.prototype.callToolResult as unknown as {
				mockRestore?: () => void;
			}
		).mockRestore?.();
	});

	test("blocks docs operations run through execute_tool", async () => {
		const server = createDrishtiMcpServer("test-key");
		const result = await server.callToolResult("execute_tool", {
			name: "search_docs",
			arguments: { query: "websockets" },
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain("not available");
	});

	test("hides the server key in citation links", async () => {
		stubUpstream(SERVER_KEY);
		const server = createDrishtiMcpServer(SERVER_KEY);
		const result = await server.callToolResult("execute_tool", {
			name: "get_announcements",
			arguments: {},
		});
		const text = JSON.stringify(result.content);
		expect(text).not.toContain(SERVER_KEY);
		expect(text).toContain("/api/citation/announcements/citations/abc123/pdf");
	});

	test("keeps a user's own key in their links", async () => {
		stubUpstream("user-key");
		const server = createDrishtiMcpServer("user-key");
		const result = await server.callToolResult("execute_tool", {
			name: "get_announcements",
			arguments: {},
		});
		expect(JSON.stringify(result.content)).toContain("api_key=user-key");
	});

	test("reports each call's timing and response size", async () => {
		stubUpstream("user-key");
		const calls: unknown[][] = [];
		const server = createDrishtiMcpServer("user-key", (...args) =>
			calls.push(args),
		);
		const args = { name: "get_announcements", arguments: {} };
		const result = await server.callToolResult("execute_tool", args);

		expect(calls).toHaveLength(1);
		const [toolName, sentArgs, timing] = calls[0] as [
			string,
			unknown,
			{ durationMs: number; responseBytes: number; isError?: boolean },
		];
		expect(toolName).toBe("execute_tool");
		expect(sentArgs).toEqual(args);
		expect(timing.durationMs).toBeGreaterThanOrEqual(0);
		expect(timing.responseBytes).toBe(
			new TextEncoder().encode(
				(result.content[0] as unknown as { text: string }).text,
			).length,
		);
		expect(timing.isError).toBeUndefined();
	});

	test("reports blocked operations as errors", async () => {
		const calls: unknown[][] = [];
		const server = createDrishtiMcpServer("test-key", (...args) =>
			calls.push(args),
		);
		await server.callToolResult("execute_tool", {
			name: "search_docs",
			arguments: {},
		});
		expect((calls[0]?.[2] as { isError?: boolean }).isError).toBe(true);
	});
});
