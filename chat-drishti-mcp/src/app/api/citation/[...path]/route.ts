import { env } from "~/env";
import {
	DRISHTI_API_ORIGIN,
	extractCitationFileUrl,
	isAllowedCitationPath,
} from "~/lib/citations";

/** Opens a Drishti source document using the server key, without exposing it. */
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const path = (await params).path.join("/");

	if (!isAllowedCitationPath(path)) {
		return new Response("Not found", { status: 404 });
	}
	if (!env.DRISHTI_API_KEY) {
		return new Response("Source links are not set up on this server.", {
			status: 404,
		});
	}

	const upstream = new URL(`/v1/${path}`, DRISHTI_API_ORIGIN);
	upstream.searchParams.set("api_key", env.DRISHTI_API_KEY);

	const res = await fetch(upstream, { redirect: "manual" });
	const fileUrl = res.ok ? extractCitationFileUrl(await res.text()) : null;

	if (!fileUrl) {
		return new Response(
			"This source document is not available right now. Please try again later.",
			{ status: res.status === 404 ? 404 : 502 },
		);
	}

	return Response.redirect(fileUrl, 302);
}
