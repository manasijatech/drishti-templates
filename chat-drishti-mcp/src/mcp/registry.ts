import {
	connectMcpServers,
	type MCPServer,
	type MCPServers,
} from "@openai/agents";
import { createDrishtiMcpServer, type ToolCallListener } from "./drishti";

export interface McpRegistryOptions {
	drishtiApiKey?: string;
	onToolCall?: ToolCallListener;
}

export async function connectMarketDataServers(
	options: McpRegistryOptions = {},
): Promise<MCPServers> {
	const servers: MCPServer[] = [
		createDrishtiMcpServer(options.drishtiApiKey, options.onToolCall),
	];

	return connectMcpServers(servers, { connectInParallel: true });
}

export { createDrishtiMcpServer } from "./drishti";
