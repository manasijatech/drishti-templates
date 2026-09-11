import type {
	CorporateActionLifecycle,
	LifecycleAiValidation,
} from "@lifecycle/contracts";
import OpenAI from "openai";
import { z } from "zod";

export const OPENROUTER_LIFECYCLE_MODEL =
	"deepseek/deepseek-v4-flash-0731:nitro";

const validationResponse = z.object({
	status: z.enum(["verified", "needs_review"]),
	rationale: z.string().trim().min(1).max(700),
	suggestions: z.array(z.string().trim().min(1).max(300)).max(5),
});

export interface LifecycleValidator {
	validate(
		lifecycle: CorporateActionLifecycle,
	): Promise<LifecycleAiValidation | undefined>;
}

export class OpenRouterLifecycleValidator implements LifecycleValidator {
	private readonly client: OpenAI;

	constructor(
		apiKey: string,
		options: { fetch?: typeof fetch; model?: string } = {},
	) {
		this.model = options.model ?? OPENROUTER_LIFECYCLE_MODEL;
		this.client = new OpenAI({
			apiKey,
			baseURL: "https://openrouter.ai/api/v1",
			fetch: options.fetch,
			maxRetries: 0,
			timeout: 10_000,
		});
	}

	private readonly model: string;

	async validate(
		lifecycle: CorporateActionLifecycle,
	): Promise<LifecycleAiValidation> {
		const completion = await this.client.chat.completions.create({
			model: this.model,
			temperature: 0,
			response_format: { type: "json_object" },
			messages: [
				{
					role: "system",
					content:
						"You are an advisory validator for Indian listed-company corporate-action lifecycles. Assess only the supplied source-derived data. Do not invent events, dates, terms, or links. Return JSON with status, rationale, and suggestions. Use needs_review for a material conflict, unsupported stage, or ambiguous grouping; otherwise use verified.",
				},
				{
					role: "user",
					content: JSON.stringify(validationInput(lifecycle)),
				},
			],
		});
		const content = completion.choices[0]?.message.content;
		if (!content) throw new Error("Lifecycle validator returned no content.");
		const result = validationResponse.parse(JSON.parse(content));
		return {
			...result,
			model: this.model,
			processedAt: new Date().toISOString(),
		};
	}
}

export function createOpenRouterLifecycleValidator(
	apiKey: string | undefined,
): LifecycleValidator | undefined {
	const normalized = apiKey?.trim();
	return normalized ? new OpenRouterLifecycleValidator(normalized) : undefined;
}

function validationInput(lifecycle: CorporateActionLifecycle): object {
	return {
		id: lifecycle.id,
		symbol: lifecycle.symbol,
		actionType: lifecycle.actionType,
		state: lifecycle.state,
		status: lifecycle.status,
		summary: lifecycle.summary,
		terms: lifecycle.terms.map(({ key, value, announcementId }) => ({
			key,
			value,
			announcementId,
		})),
		stages: lifecycle.stages.map(
			({ id, label, status, date, announcementIds }) => ({
				id,
				label,
				status,
				date,
				announcementIds,
			}),
		),
		changes: lifecycle.changes.map(
			({ title, description, announcementId, previousValue, newValue }) => ({
				title,
				description,
				announcementId,
				previousValue,
				newValue,
			}),
		),
		announcements: lifecycle.announcements.map(
			({
				id,
				date,
				headline,
				summary,
				longSummary,
				category,
				relatedCategories,
				descriptor,
				extractedInformation,
			}) => ({
				id,
				date,
				headline,
				summary,
				longSummary,
				category,
				relatedCategories,
				descriptor,
				extractedInformation,
			}),
		),
	};
}
