import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptApiKeyServer } from "~/lib/server-encryption";

const encryptRequestSchema = z.object({
	apiKey: z.string().min(1),
});

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const parsed = encryptRequestSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const { encryptedApiKey, iv } = encryptApiKeyServer(parsed.data.apiKey);

		return NextResponse.json({ encryptedApiKey, iv });
	} catch (error) {
		console.error("[model-config/encrypt] error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to encrypt API key",
			},
			{ status: 500 },
		);
	}
}
