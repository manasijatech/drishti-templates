import { runSupervisorChatSync } from "~/lib/orchestrator";
import type {
	ChatRequestBody,
	ModelCompareResult,
	ModelConfig,
} from "~/types";

export const MODEL_COMPARE_MIN = 2;
export const MODEL_COMPARE_MAX = 4;

export async function runModelComparison(
	base: Omit<ChatRequestBody, "modelConfig">,
	modelConfigs: ModelConfig[],
	options?: { signal?: AbortSignal },
): Promise<ModelCompareResult[]> {
	const settled = await Promise.allSettled(
		modelConfigs.map(async (modelConfig) => {
			const startedAt = Date.now();
			const result = await runSupervisorChatSync(
				{
					...base,
					modelConfig,
					sessionId: `${base.sessionId ?? "compare"}-${modelConfig.provider}-${modelConfig.model}`,
				},
				{ signal: options?.signal },
			);

			return {
				provider: modelConfig.provider,
				model: modelConfig.model,
				text: result.text,
				usage: result.usage,
				durationMs: Date.now() - startedAt,
			} satisfies ModelCompareResult;
		}),
	);

	return settled.map((entry, index) => {
		const modelConfig = modelConfigs[index]!;
		if (entry.status === "fulfilled") return entry.value;

		return {
			provider: modelConfig.provider,
			model: modelConfig.model,
			text: "",
			usage: null,
			durationMs: 0,
			error:
				entry.reason instanceof Error
					? entry.reason.message
					: "Model run failed",
		};
	});
}
