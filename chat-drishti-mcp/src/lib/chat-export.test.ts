import { describe, expect, test } from "bun:test";
import {
	buildChatExport,
	buildComparisonChatExport,
	chatExportFilename,
} from "./chat-export";

describe("chat export", () => {
	test("formats the visible user and assistant text as portable Markdown", () => {
		const exported = buildChatExport({
			title: "Reliance outlook",
			exportedAt: new Date("2026-09-01T10:30:00.000Z"),
			messages: [
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", text: "What changed today?" }],
				},
				{
					id: "assistant-1",
					role: "assistant",
					parts: [
						{ type: "step-start" },
						{ type: "text", text: "Revenue guidance increased." },
					],
				},
			],
		});

		expect(exported).toBe(
			"# Reliance outlook\n\nExported from Drishti Chat on 1 September 2026 at 16:00 IST.\n\n## You\n\nWhat changed today?\n\n## Drishti\n\nRevenue guidance increased.\n",
		);
	});

	test("omits messages without visible text and joins text parts", () => {
		const exported = buildChatExport({
			title: "New chat",
			exportedAt: new Date("2026-09-01T00:00:00.000Z"),
			messages: [
				{
					id: "assistant-tool",
					role: "assistant",
					parts: [{ type: "step-start" }],
				},
				{
					id: "assistant-text",
					role: "assistant",
					parts: [
						{ type: "text", text: "First line." },
						{ type: "text", text: "Second line." },
					],
				},
			],
		});

		expect(exported).toContain("First line.\n\nSecond line.");
		expect(exported.match(/## Drishti/g)).toHaveLength(1);
	});

	test("creates a filesystem-safe Markdown filename", () => {
		expect(
			chatExportFilename("TCS / Infosys: Q1?", new Date("2026-09-01")),
		).toBe("tcs-infosys-q1-2026-09-01.md");
	});

	test("preserves visible attachments, errors, and detailed tool calls", () => {
		const exported = buildChatExport({
			title: "Rich chat",
			exportedAt: new Date("2026-09-01T00:00:00.000Z"),
			messages: [
				{
					id: "user-rich",
					role: "user",
					parts: [
						{ type: "file", filename: "annual-report.pdf" },
						{ type: "image", url: "data:image/png;base64,ignored" },
					],
				},
				{
					id: "assistant-rich",
					role: "assistant",
					parts: [
						{
							type: "tool-get_quote",
							state: "output-available",
							input: { symbol: "RELIANCE" },
							output: { price: 1_500.25, currency: "INR" },
						},
						{ type: "error", message: "Quote unavailable" },
					],
				},
			] as never,
		});

		expect(exported).toContain("[Attachment: annual-report.pdf]");
		expect(exported).toContain("[Image attachment]");
		expect(exported).toContain("### Tool call: get_quote");
		expect(exported).toContain("**Status:** Output available");
		expect(exported).toContain(
			'**Arguments**\n\n````json\n{\n  "symbol": "RELIANCE"\n}\n````',
		);
		expect(exported).toContain(
			'**Result**\n\n````json\n{\n  "price": 1500.25,\n  "currency": "INR"\n}\n````',
		);
		expect(exported).toContain("> Error: Quote unavailable");
	});

	test("exports each visible model comparison as its own section", () => {
		const exported = buildComparisonChatExport({
			title: "Model comparison",
			query: "Compare TCS and Infosys",
			exportedAt: new Date("2026-09-01T00:00:00.000Z"),
			results: [
				{
					label: "Gemini 2.5 Flash",
					messages: [
						{
							id: "gemini-answer",
							role: "assistant",
							parts: [{ type: "text", text: "Gemini answer" }],
						},
					],
				},
				{
					label: "GPT-5",
					messages: [
						{
							id: "gpt-answer",
							role: "assistant",
							parts: [{ type: "text", text: "GPT answer" }],
						},
					],
				},
			],
		});

		expect(exported).toContain("## Prompt\n\nCompare TCS and Infosys");
		expect(exported).toContain(
			"## Gemini 2.5 Flash\n\n### Drishti\n\nGemini answer",
		);
		expect(exported).toContain("## GPT-5\n\n### Drishti\n\nGPT answer");
	});
});
