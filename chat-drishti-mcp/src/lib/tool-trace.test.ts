import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
	buildTraceTurns,
	extractSourceLinks,
	redactSecrets,
	ToolTimingRecorder,
	toJsonRpcRequest,
	tokenizeJson,
	withToolTimings,
} from "./tool-trace";

const timing = (durationMs: number) => ({
	startedAt: 1,
	durationMs,
	responseBytes: 10,
});

async function readAll(stream: ReadableStream) {
	const chunks: unknown[] = [];
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) return chunks;
		chunks.push(value);
	}
}

function streamOf(chunks: unknown[]) {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

describe("ToolTimingRecorder", () => {
	test("matches string arguments to the parsed call, ignoring key order", () => {
		const recorder = new ToolTimingRecorder();
		recorder.record(
			"execute_tool",
			{ name: "get_news", arguments: { symbols: ["TCS"], days: 7 } },
			timing(120),
		);
		const fromStream =
			'{"arguments":{"days":7,"symbols":["TCS"]},"name":"get_news"}';
		expect(recorder.take("execute_tool", fromStream)?.durationMs).toBe(120);
		expect(recorder.take("execute_tool", fromStream)).toBeUndefined();
	});

	test("hands out identical calls in order", () => {
		const recorder = new ToolTimingRecorder();
		recorder.record("read_me", {}, timing(1));
		recorder.record("read_me", {}, timing(2));
		expect(recorder.take("read_me", {})?.durationMs).toBe(1);
		expect(recorder.take("read_me", {})?.durationMs).toBe(2);
	});
});

describe("withToolTimings", () => {
	test("adds a metadata chunk after each timed tool result", async () => {
		const recorder = new ToolTimingRecorder();
		recorder.record("read_me", { mode: "data" }, timing(250));
		const chunks = await readAll(
			withToolTimings(
				streamOf([
					{
						type: "tool-input-available",
						toolCallId: "c1",
						toolName: "read_me",
						input: '{"mode":"data"}',
					},
					{ type: "tool-output-available", toolCallId: "c1", output: "ok" },
					{ type: "text-delta", id: "t", delta: "hi" },
				]),
				recorder,
			),
		);
		expect(chunks).toHaveLength(4);
		expect(chunks[2]).toEqual({
			type: "message-metadata",
			messageMetadata: { toolTimings: { c1: timing(250) } },
		});
	});

	test("passes results through untouched when no timing was recorded", async () => {
		const chunks = await readAll(
			withToolTimings(
				streamOf([
					{ type: "tool-output-available", toolCallId: "x", output: "ok" },
				]),
				new ToolTimingRecorder(),
			),
		);
		expect(chunks).toHaveLength(1);
	});
});

describe("display helpers", () => {
	test("hides API keys in links and bearer headers", () => {
		const text =
			"https://developers.manasija.in/v1/announcements/citations/a1/pdf?api_key=secret123 Bearer abcdefghijkl";
		const redacted = redactSecrets(text);
		expect(redacted).not.toContain("secret123");
		expect(redacted).not.toContain("abcdefghijkl");
		expect(redacted).toContain("api_key=•••");
	});

	test("lists source links once, with keys hidden", () => {
		const text = JSON.stringify({
			citation_url: "https://x.in/a.pdf?api_key=k1",
			again: "https://x.in/a.pdf?api_key=k1",
			local: "/api/citation/earnings/citations/b2/page/3",
		});
		expect(extractSourceLinks(text)).toEqual([
			"https://x.in/a.pdf?api_key=•••",
			"/api/citation/earnings/citations/b2/page/3",
		]);
	});

	test("builds the JSON-RPC tools/call body", () => {
		expect(toJsonRpcRequest("execute_tool", '{"name":"get_news"}')).toEqual({
			jsonrpc: "2.0",
			method: "tools/call",
			params: { name: "execute_tool", arguments: { name: "get_news" } },
		});
	});
});

describe("buildTraceTurns", () => {
	test("pairs each answer's tool calls with its question and timings, newest first", () => {
		const messages = [
			{ id: "u1", role: "user", parts: [{ type: "text", text: "First?" }] },
			{
				id: "a1",
				role: "assistant",
				metadata: {
					toolTimings: { c1: timing(100), c2: timing(50) },
					queryUsage: {
						promptTokens: 1,
						completionTokens: 1,
						totalTokens: 2,
						requests: 2,
					},
				},
				parts: [
					{
						type: "dynamic-tool",
						toolName: "read_me",
						toolCallId: "c1",
						state: "output-available",
						input: {},
						output: "x",
					},
					{
						type: "dynamic-tool",
						toolName: "execute_tool",
						toolCallId: "c2",
						state: "output-available",
						input: { name: "get_news" },
						output: "y",
					},
					{ type: "text", text: "Answer" },
				],
			},
			{ id: "u2", role: "user", parts: [{ type: "text", text: "Thanks" }] },
			{ id: "a2", role: "assistant", parts: [{ type: "text", text: "Sure" }] },
		] as unknown as UIMessage[];

		const turns = buildTraceTurns(messages);
		expect(turns).toHaveLength(1);
		expect(turns[0]?.question).toBe("First?");
		expect(turns[0]?.calls.map((c) => c.timing?.durationMs)).toEqual([100, 50]);
		expect(turns[0]?.totalMcpMs).toBe(150);
		expect(turns[0]?.usage?.requests).toBe(2);
	});
});

describe("tokenizeJson", () => {
	test("colours keys, strings, numbers and literals, and keeps every character", () => {
		const text =
			'{\n  "name": "get_news",\n  "days": 7,\n  "ok": true,\n  "x": null\n}';
		const tokens = tokenizeJson(text);
		expect(tokens.map((t) => t.text).join("")).toBe(text);
		const kinds = (kind: string) =>
			tokens.filter((t) => t.kind === kind).map((t) => t.text);
		expect(kinds("key")).toEqual(['"name"', '"days"', '"ok"', '"x"']);
		expect(kinds("string")).toEqual(['"get_news"']);
		expect(kinds("number")).toEqual(["7"]);
		expect(kinds("literal")).toEqual(["true", "null"]);
	});

	test("handles escaped quotes and a cut-off preview", () => {
		const text = '{"q": "say \\"hi\\"", "cut": "unfinish';
		const tokens = tokenizeJson(text);
		expect(tokens.map((t) => t.text).join("")).toBe(text);
		expect(tokens.find((t) => t.kind === "string")?.text).toBe(
			'"say \\"hi\\""',
		);
	});
});
