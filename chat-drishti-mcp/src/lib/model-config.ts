import type { EncryptedModelConfig, ModelConfig, ModelProviderId } from "~/types";
import { decryptApiKeyServer } from "~/lib/server-encryption";

export function resolveModelConfigFromEncrypted(
	config: EncryptedModelConfig,
): ModelConfig {
	const apiKey =
		config.provider === "ollama" && !config.encryptedApiKey
			? ""
			: decryptApiKeyServer(config.encryptedApiKey, config.iv);

	return {
		provider: config.provider,
		model: config.model,
		apiKey,
		baseUrl: config.baseUrl,
	};
}

export function hasEncryptedApiKey(
	provider: ModelProviderId,
	config: Pick<EncryptedModelConfig, "encryptedApiKey">,
): boolean {
	if (provider === "ollama") return true;
	return Boolean(config.encryptedApiKey?.trim());
}
