import {
	connectMcpServers,
	type MCPServer,
	type MCPServers,
} from "@openai/agents";
import { createDrishtiMcpServer } from "./drishti";

export interface McpRegistryOptions {
	drishtiApiKey?: string;
}

export async function connectMarketDataServers(
	options: McpRegistryOptions = {},
): Promise<MCPServers> {
	const servers: MCPServer[] = [createDrishtiMcpServer(options.drishtiApiKey)];

	return connectMcpServers(servers, { connectInParallel: true });
}

export { createDrishtiMcpServer } from "./drishti";
