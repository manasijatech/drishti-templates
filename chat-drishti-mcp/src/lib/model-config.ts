import type {
	EncryptedApiKeyCredential,
	EncryptedModelConfig,
	ModelConfig,
	ModelProviderId,
} from "~/types";
import { decryptApiKeyServer } from "~/lib/server-encryption";

export function resolveDrishtiApiKeyFromEncrypted(
	credential: EncryptedApiKeyCredential,
): string {
	if (!credential.encryptedApiKey?.trim()) {
		throw new Error("Drishti MCP API key is required.");
	}
	return decryptApiKeyServer(credential.encryptedApiKey, credential.iv);
}

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
