import { describe, expect, test } from "bun:test";
import {
	extractCitationFileUrl,
	hideCitationKeys,
	isAllowedCitationPath,
} from "./citations";

const KEY = "secret-key_123";

describe("hideCitationKeys", () => {
	test("rewrites filing, earnings page, and concall links", () => {
		const text = JSON.stringify({
			a: `https://developers.manasija.in/v1/announcements/citations/6ad46da1b9/pdf?api_key=${KEY}`,
			b: `https://developers.manasija.in/v1/earnings/citations/6a61f244/page/22?api_key=${KEY}`,
			c: `https://developers.manasija.in/v1/concalls/citations/6ace5976/pdf?api_key=${KEY}`,
		});
		const out = hideCitationKeys(text);
		expect(out).not.toContain(KEY);
		expect(out).toContain(
			'"/api/citation/announcements/citations/6ad46da1b9/pdf"',
		);
		expect(out).toContain(
			'"/api/citation/earnings/citations/6a61f244/page/22"',
		);
		expect(out).toContain('"/api/citation/concalls/citations/6ace5976/pdf"');
	});

	test("leaves other links alone", () => {
		const text = "https://example.com/report.pdf?api_key=abc";
		expect(hideCitationKeys(text)).toBe(text);
	});
});

describe("isAllowedCitationPath", () => {
	test("allows only citation paths", () => {
		expect(isAllowedCitationPath("earnings/citations/abc123/page/10")).toBe(
			true,
		);
		expect(isAllowedCitationPath("announcements/citations/abc/pdf")).toBe(true);
		expect(isAllowedCitationPath("../admin")).toBe(false);
		expect(isAllowedCitationPath("announcements?x=1")).toBe(false);
	});
});

describe("extractCitationFileUrl", () => {
	test("reads the signed file link from the redirect page", () => {
		const html =
			'<html><script>window.location.replace("/v1/citations/file?token=abc.def");</script></html>';
		expect(extractCitationFileUrl(html)).toBe(
			"https://developers.manasija.in/v1/citations/file?token=abc.def",
		);
	});

	test("refuses redirects to other sites", () => {
		const html =
			'<script>window.location.replace("https://evil.example/x");</script>';
		expect(extractCitationFileUrl(html)).toBeNull();
	});
});
