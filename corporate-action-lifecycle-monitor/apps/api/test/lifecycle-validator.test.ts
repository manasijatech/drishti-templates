import { describe, expect, test } from "bun:test";

import { buildLifecycles, type SourceAnnouncement } from "../src/domain";
import {
	createOpenRouterLifecycleValidator,
	OPENROUTER_LIFECYCLE_MODEL,
	OpenRouterLifecycleValidator,
} from "../src/lifecycle-validator";

const announcement: SourceAnnouncement = {
	id: "rights-1",
	symbol: "TCS",
	companyName: "Tata Consultancy Services Ltd.",
	date: "2026-09-10T10:00:00.000Z",
	headline: "Rights issue record date",
	summary: "The record date for the rights issue has been announced.",
	category: "Rights Issue",
	relatedCategories: [],
	exchange: "NSE",
	extractedInformation: { rights_issue: { record_date: "2026-09-20" } },
};

describe("OpenRouter lifecycle validator", () => {
	test("uses the requested model and validates JSON-only advisory output", async () => {
		let requestUrl = "";
		let requestBody = "";
		const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
			requestUrl = String(input);
			requestBody = String(init?.body ?? "");
			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									status: "verified",
									rationale:
										"The source filing supports the record-date stage.",
									suggestions: ["Watch for the issue opening announcement."],
								}),
							},
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;
		const [lifecycle] = buildLifecycles([announcement]);
		const validator = new OpenRouterLifecycleValidator("test-key", {
			fetch: fetchImpl,
		});

		const result = await validator.validate(lifecycle);

		expect(requestUrl).toContain(
			"https://openrouter.ai/api/v1/chat/completions",
		);
		expect(requestBody).toContain(OPENROUTER_LIFECYCLE_MODEL);
		expect(result).toMatchObject({
			status: "verified",
			model: OPENROUTER_LIFECYCLE_MODEL,
			suggestions: ["Watch for the issue opening announcement."],
		});
	});

	test("does not create a validator without an OpenRouter key", () => {
		expect(createOpenRouterLifecycleValidator(undefined)).toBeUndefined();
		expect(createOpenRouterLifecycleValidator("   ")).toBeUndefined();
	});

	test("rejects malformed advisory output", async () => {
		const fetchImpl = (async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "not json" } }],
				}),
				{ headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;
		const [lifecycle] = buildLifecycles([announcement]);
		const validator = new OpenRouterLifecycleValidator("test-key", {
			fetch: fetchImpl,
		});

		expect(validator.validate(lifecycle)).rejects.toThrow();
	});
});
