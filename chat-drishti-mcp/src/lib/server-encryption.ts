import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "~/env";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const KEY_SALT = "drishti-api-key-v1";

function getEncryptionKey(): Buffer {
	const secret = env.API_KEY_ENCRYPTION_SECRET ?? env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			"API_KEY_ENCRYPTION_SECRET (or BETTER_AUTH_SECRET) is required to encrypt API keys.",
		);
	}
	return scryptSync(secret, KEY_SALT, 32);
}

export function encryptApiKeyServer(plaintext: string): {
	encryptedApiKey: string;
	iv: string;
} {
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	const combined = Buffer.concat([ciphertext, authTag]);

	return {
		encryptedApiKey: combined.toString("base64"),
		iv: iv.toString("base64"),
	};
}

export function decryptApiKeyServer(encryptedApiKey: string, iv: string): string {
	const ivBytes = Buffer.from(iv, "base64");
	const combined = Buffer.from(encryptedApiKey, "base64");
	if (combined.length <= AUTH_TAG_BYTES) {
		throw new Error("Invalid encrypted API key payload.");
	}

	const authTag = combined.subarray(combined.length - AUTH_TAG_BYTES);
	const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
	const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), ivBytes);
	decipher.setAuthTag(authTag);

	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
		"utf8",
	);
}
