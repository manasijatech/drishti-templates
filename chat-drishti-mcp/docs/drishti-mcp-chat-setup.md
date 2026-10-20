# How to Set Up Chat Using Drishti MCP as a Tool

This guide covers the **server-side core** of wiring [Drishti MCP](https://mcp.drishti.manasija.in) into a chat backend with the **OpenAI Agents SDK** and the **Vercel AI SDK**. No UI code — only MCP connection, agent setup, tool exposure, and streaming a chat response.

---

## Architecture (mental model)

```
User message
    ↓
Chat API route
    ↓
Orchestrator (run agent)
    ↓
Agent (LLM)  ──calls──►  Drishti MCP tools  (read_me, describe_tools, execute_tool)
    ↓
Streamed response  ──►  AI SDK UI message stream
```

The Agents SDK does **not** require you to manually register each Drishti tool. You attach an MCP server to an `Agent`; at runtime the SDK:

1. Connects to the MCP server
2. Calls `listTools`
3. Exposes those tools to the model as callable functions
4. Executes `callTool` when the model invokes them

Your job is: **create the MCP client → connect it → pass `mcpServers` to `Agent` → call `run()`**.

---

## 1. Install dependencies

```bash
npm install @openai/agents @openai/agents-extensions ai @ai-sdk/openai
```

| Package | Role |
|---------|------|
| `@openai/agents` | `Agent`, `run()`, MCP client (`MCPServerStreamableHttp`, `connectMcpServers`) |
| `@openai/agents-extensions` | Bridge Agents SDK runs to AI SDK streams (`aisdk`, `createAiSdkUiMessageStreamResponse`) |
| `ai` | UI message stream types / response helpers |
| `@ai-sdk/openai` | Example model provider (Anthropic, Google, Groq, OpenRouter work the same way) |

---

## 2. Environment variables

```env
# Required: Drishti MCP returns 401 without a valid key
DRISHTI_API_KEY=your_key_here

# Defaults to https://mcp.drishti.manasija.in
DRISHTI_MCP_URL=https://mcp.drishti.manasija.in

# Your LLM provider key (example: OpenAI)
OPENAI_API_KEY=sk-...
```

Drishti MCP uses **Streamable HTTP** transport. Auth is sent as a Bearer token on each request.

---

## 3. Create the Drishti MCP server client

Use `MCPServerStreamableHttp` from the Agents SDK. This is a thin client — it does not run the MCP server locally; it talks to Drishti over HTTP.

```typescript
// mcp/drishti.ts
import { MCPServerStreamableHttp } from "@openai/agents";

const DRISHTI_MCP_URL =
  process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in";

export function createDrishtiMcpServer(apiKey?: string) {
  return new MCPServerStreamableHttp({
    url: DRISHTI_MCP_URL,
    name: "Drishti",
    cacheToolsList: true, // avoid re-listing tools on every turn

    // Optional: block tools you don't want the model to see
    toolFilter: {
      blockedToolNames: ["search_docs", "get_doc"],
    },

    ...(apiKey
      ? {
          requestInit: {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        }
      : {}),
  });
}
```

**Key options**

- `url` — Drishti MCP endpoint
- `name` — label used in logs/traces
- `cacheToolsList` — caches `listTools` result per server instance
- `toolFilter.blockedToolNames` / `allowedToolNames` — static allow/deny lists
- `requestInit.headers` — Bearer auth for Drishti

---

## 4. Connect MCP servers for a request

Wrap server creation in a registry and call `connectMcpServers`. This opens the connection and prepares tools for agents.

```typescript
// mcp/registry.ts
import { connectMcpServers, type MCPServer } from "@openai/agents";
import { createDrishtiMcpServer } from "./drishti";

export async function connectMarketDataServers(options: { drishtiApiKey?: string }) {
  const servers: MCPServer[] = [
    createDrishtiMcpServer(options.drishtiApiKey),
  ];

  return connectMcpServers(servers, { connectInParallel: true });
}
```

`connectMcpServers` returns a handle with:

- `active` — connected servers to pass into `Agent({ mcpServers })`
- `failed` / `errors` — servers that could not connect
- `close()` — **must** be called when the request finishes (releases MCP session)

> **Check `active` before running the agent.** A bad API key does not throw: the
> server just lands in `failed`. If you run the agent anyway it has no tools and
> will answer without live data. Stop and show an error instead:
>
> ```typescript
> if (mcpServers.active.length === 0) {
>   throw new Error("Could not connect to Drishti. Check your API key.");
> }
> ```

---

## 5. Wire any LLM provider into the Agents SDK

The Agents SDK expects its own `model` object. Use `aisdk()` from `@openai/agents-extensions/ai-sdk` to wrap Vercel AI SDK providers.

```typescript
// providers/index.ts
import { createOpenAI } from "@ai-sdk/openai";
import { aisdk } from "@openai/agents-extensions/ai-sdk";

export function createAgentModel(apiKey: string, modelId = "gpt-4.1") {
  const openai = createOpenAI({ apiKey });
  return aisdk(openai(modelId));
}
```

The same pattern works for Anthropic, Google, Groq, OpenRouter, Ollama, etc. — only the provider client changes.

---

## 6. Attach MCP to an Agent (this is where tools appear)

Pass the **connected** MCP servers into `mcpServers`. The SDK converts each MCP tool into a model-callable function automatically.

```typescript
// agents/market-agent.ts
import { Agent } from "@openai/agents";

export function createMarketAgent(model: unknown, mcpServers: unknown[]) {
  return new Agent({
    name: "Market Agent",
    instructions: `
You are an Indian stock market research assistant (NSE/BSE).
Use Drishti MCP tools for live prices, top movers, news, earnings, and announcements.
Always cite which tool/data you used.
    `.trim(),
    model: model as never,
    mcpServers: mcpServers as never[],
  });
}
```

Drishti MCP uses a compact protocol, so the model sees a few general tools instead of one tool per operation:

- `read_me` — call with `{ mode: "data" }` to get routing guidance and the list of operations
- `describe_tools` — get the input schema for one or more operations
- `execute_tool` — run an operation: `{ name: "get_top_movers", arguments: { ... } }`

Useful operations include `resolve_symbols`, `get_daily_summary`, `get_top_movers`, `get_news`, `get_announcements`, `get_upcoming_earnings`, `list_earnings`, `get_concalls`, and `get_sectoral_data`.

Tell the model about this flow in its instructions (see `src/agents/drishti-agent.ts`). You do **not** define JSON schemas manually — MCP provides them.

---

## 7. Run chat and stream the response

The orchestrator ties everything together: connect MCP → build agent → `run()` → stream to AI SDK format.

```typescript
// lib/run-chat.ts
import { run } from "@openai/agents";
import { createAiSdkUiMessageStreamResponse } from "@openai/agents-extensions/ai-sdk-ui";
import { connectMarketDataServers } from "../mcp/registry";
import { createMarketAgent } from "../agents/market-agent";
import { createAgentModel } from "../providers";

export async function runDrishtiChat(userMessage: string, options?: { signal?: AbortSignal }) {
  const model = createAgentModel(process.env.OPENAI_API_KEY!);
  const mcp = await connectMarketDataServers({
    drishtiApiKey: process.env.DRISHTI_API_KEY,
  });

  try {
    const agent = createMarketAgent(model, mcp.active);
    const result = await run(agent, userMessage, {
      stream: true,
      signal: options?.signal,
    });

    // Converts Agents SDK stream → AI SDK UI message stream (SSE)
    const response = createAiSdkUiMessageStreamResponse(result, {
      headers: { "X-Session-Id": crypto.randomUUID() },
    });

    return { response, cleanup: () => mcp.close() };
  } catch (error) {
    await mcp.close();
    throw error;
  }
}
```

**Important lifecycle rules**

1. Call `connectMarketDataServers()` **once per request** (or per session if you manage pooling yourself).
2. Always call `mcp.close()` in `finally` or via a `cleanup` callback after the stream ends.
3. Pass `signal` through to `run()` so client disconnects abort the agent run.

---

## 8. Minimal API route

```typescript
// app/api/chat/route.ts
import { runDrishtiChat } from "@/lib/run-chat";

export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message?.trim()) {
    return Response.json({ error: "message required" }, { status: 400 });
  }

  const { response, cleanup } = await runDrishtiChat(message, {
    signal: req.signal,
  });

  // Pipe stream and ensure MCP cleanup on completion
  const body = response.body;
  if (!body) {
    await cleanup();
    return response;
  }

  const reader = body.getReader();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        await cleanup();
        controller.close();
      }
    },
    cancel() {
      void cleanup();
    },
  });

  return new Response(stream, {
    status: response.status,
    headers: response.headers,
  });
}
```

The client can consume this with AI SDK `useChat` + `DefaultChatTransport`, or any SSE consumer. That wiring is outside the scope of this guide.

---

## 9. End-to-end minimal example (single file)

Copy-paste starting point without a framework:

```typescript
import { Agent, run, MCPServerStreamableHttp, connectMcpServers } from "@openai/agents";
import { createOpenAI } from "@ai-sdk/openai";
import { aisdk } from "@openai/agents-extensions/ai-sdk";

async function main() {
  // 1. MCP client
  const drishti = new MCPServerStreamableHttp({
    url: process.env.DRISHTI_MCP_URL ?? "https://mcp.drishti.manasija.in",
    name: "Drishti",
    cacheToolsList: true,
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.DRISHTI_API_KEY}` },
    },
  });

  // 2. Connect
  const mcp = await connectMcpServers([drishti]);
  if (mcp.active.length === 0) {
    throw new Error("Could not connect to Drishti. Check your API key.");
  }

  // 3. Model
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = aisdk(openai("gpt-4.1"));

  // 4. Agent with MCP tools attached
  const agent = new Agent({
    name: "Drishti Assistant",
    instructions: "Answer using Drishti MCP tools for Indian market data.",
    model: model as never,
    mcpServers: mcp.active as never[],
  });

  try {
    // 5. Run — model will call MCP tools as needed
    const result = await run(
      agent,
      "What are today's top movers on NSE?",
      { stream: false },
    );

    console.log(result.finalOutput);
  } finally {
    await mcp.close();
  }
}

main().catch(console.error);
```

---

## 10. Debugging checklist

| Symptom | Likely cause |
|---------|----------------|
| Model never calls tools | `mcpServers` not passed to `Agent`, or instructions don't mention using tools |
| `401` from MCP | Missing/invalid `DRISHTI_API_KEY` |
| Tools list empty | MCP URL wrong, server down, or all tools blocked by `toolFilter` |
| Hangs after response | `mcp.close()` not called |
| Tool name mismatch in logs | MCP tools may be prefixed with server name depending on SDK version — normalize when logging |

To inspect available tools after connect:

```typescript
const tools = await mcp.active[0]!.listTools();
console.log(tools.map((t) => t.name));
```

---

## 11. How this repo maps to the guide

| Guide step | Repo file |
|------------|-----------|
| MCP client | `src/mcp/drishti.ts` |
| Connect registry | `src/mcp/registry.ts` |
| Model bridge | `src/providers/index.ts` |
| Agent + MCP | `src/agents/*.ts` |
| Run + stream | `src/lib/orchestrator.ts` |
| HTTP entry | `src/app/api/chat/route.ts` |

---

## Summary

1. **`MCPServerStreamableHttp`** — HTTP client to Drishti MCP  
2. **`connectMcpServers()`** — open session, get `active` servers  
3. **`Agent({ mcpServers })`** — MCP tools become LLM tools automatically  
4. **`run(agent, prompt)`** — model reasons and invokes Drishti tools  
5. **`createAiSdkUiMessageStreamResponse()`** — optional bridge to AI SDK streaming  
6. **`mcp.close()`** — always clean up per request  

That is the full core loop: **MCP server → connected servers → agent → run → stream**, with Drishti providing Indian market data as first-class agent tools.
