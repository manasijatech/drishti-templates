import { defineEnv } from "envin";
import * as z from "zod";

const env = defineEnv({
	shared: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	server: {
		API_INTERNAL_URL: z.url().default("http://localhost:4000"),
		PUBLIC_API_URL: z.url().default("http://localhost:4000"),
		FRONTEND_ORIGIN: z.url().default("http://localhost:3000"),
		DRISHTI_API_KEY: z.string().min(1).optional(),
		MONGODB_URI: z
			.url()
			.refine(
				(url) =>
					url.startsWith("mongodb://") || url.startsWith("mongodb+srv://"),
				{
					message: "MONGODB_URI must be a MongoDB connection string",
				},
			)
			.default("mongodb://localhost:27017/corporate_actions"),
		MONGODB_MAX_POOL_SIZE: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.default(10),
		OPENROUTER_API_KEY: z.string().min(1).optional(),
	},
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_LIFECYCLE_WS_URL: z
			.url()
			.default("ws://localhost:4000/ws/lifecycles"),
	},
	env: process.env,
	skip: process.env.SKIP_ENV_VALIDATION === "true",
	onError: (issues) => {
		console.error("Invalid environment variables:", issues);
		process.exit(1);
	},
	onInvalidAccess: (variable) => {
		throw new Error(
			`Attempted to access server variable "${variable}" on the client`,
		);
	},
});

export default env;
