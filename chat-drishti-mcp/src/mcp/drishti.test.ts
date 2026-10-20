import { describe, expect, test } from "bun:test";
import { createDrishtiMcpServer } from "./drishti";

describe("Drishti MCP server", () => {
	test("blocks docs operations run through execute_tool", async () => {
		const server = createDrishtiMcpServer("test-key");
		const result = await server.callToolResult("execute_tool", {
			name: "search_docs",
			arguments: { query: "websockets" },
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain("not available");
	});
});
