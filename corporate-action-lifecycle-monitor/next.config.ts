import type { NextConfig } from "next";

import "./env.config";

const nextConfig: NextConfig = {
	output: "standalone",
	async rewrites() {
		return [
			{
				source: "/backend/:path*",
				destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/:path*`,
			},
		];
	},
};

export default nextConfig;
