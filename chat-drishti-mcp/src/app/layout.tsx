import "~/components/agent-elements/agent-ui.css";
import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Rethink_Sans } from "next/font/google";
import { AppShell } from "~/components/layout/app-shell";

export const metadata: Metadata = {
	title: "Drishti — Indian Market Intelligence",
	description:
		"Calm, explainable Indian equities intelligence powered by Drishti MCP and multi-agent analysis.",
	icons: [
		{
			rel: "icon",
			url: "https://drishti.manasija.in/logo-mark.svg",
			type: "image/svg+xml",
		},
	],
};

export const viewport: Viewport = {
	themeColor: "#01378F",
};

const rethinkSans = Rethink_Sans({
	subsets: ["latin"],
	variable: "--font-rethink-sans",
	weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
	weight: ["400", "500"],
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${rethinkSans.variable} ${ibmPlexMono.variable}`}
			lang="en"
		>
			<body className="font-sans antialiased">
				<AppShell>{children}</AppShell>
			</body>
		</html>
	);
}
