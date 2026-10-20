/**
 * Drishti citation links carry the API key (`...pdf?api_key=KEY`). When the
 * server's shared key is used, links are rewritten to `/api/citation/...` so
 * the key never reaches the model, the browser, or chat exports.
 */

export const DRISHTI_API_ORIGIN = "https://developers.manasija.in";

const CITATION_LINK =
	/https:\/\/developers\.manasija\.in\/v1\/((?:announcements|earnings|concalls)\/citations\/[A-Za-z0-9]+\/(?:pdf|page\/\d+))\?api_key=[^\s"'&)\]]+/g;

/** Only these upstream paths may be proxied. */
const ALLOWED_PATH =
	/^(?:announcements|earnings|concalls)\/citations\/[A-Za-z0-9]+\/(?:pdf|page\/\d+)$/;

/** Replace keyed Drishti citation links with key-free app links. */
export function hideCitationKeys(text: string): string {
	return text.replace(CITATION_LINK, "/api/citation/$1");
}

export function isAllowedCitationPath(path: string): boolean {
	return ALLOWED_PATH.test(path);
}

/**
 * The citation endpoint returns a tiny page that redirects to a signed,
 * key-free file URL. Pull that URL out so the browser can go straight to it.
 */
export function extractCitationFileUrl(html: string): string | null {
	const match = html.match(/location\.replace\("([^"]+)"\)/);
	if (!match?.[1]) return null;
	const target = new URL(match[1], DRISHTI_API_ORIGIN);
	return target.origin === DRISHTI_API_ORIGIN ? target.toString() : null;
}
