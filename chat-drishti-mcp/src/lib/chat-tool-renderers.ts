import { BashTool } from "~/components/agent-elements/tools/bash-tool";
import { EditTool } from "~/components/agent-elements/tools/edit-tool";
import { SearchTool } from "~/components/agent-elements/tools/search-tool";
import { ThinkingTool } from "~/components/agent-elements/tools/thinking-tool";
import { TodoTool } from "~/components/agent-elements/tools/todo-tool";
import type { AgentChatProps } from "~/components/agent-elements/types";

export const CHAT_TOOL_RENDERERS = {
	Bash: BashTool,
	Edit: EditTool,
	Write: EditTool,
	Search: SearchTool,
	WebSearch: SearchTool,
	TodoWrite: TodoTool,
	Thinking: ThinkingTool,
} as unknown as NonNullable<AgentChatProps["toolRenderers"]>;
