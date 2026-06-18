# Drishti — Indian Stock Market AI

Agentic chat application for Indian equities powered by the OpenAI Agents SDK, Drishti MCP, and Vercel AI SDK streaming.

## Features

- **Multi-agent orchestration** — Supervisor routes to Research, News, Market, and Portfolio specialists
- **Drishti MCP** — Live Indian market data, filings, earnings, announcements, news
- **Bring your own model** — OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Ollama
- **Agent Elements UI** — Streaming chat with tool execution visibility
- **Portfolio & watchlists** — Local storage with agent context injection
- **Compliance** — Bull/bear cases, risks, and educational disclaimers on every analysis

## Quick start

```bash
cd chat-drishti-mcp
bun install
cp .env.example .env
bun dev
```

Open [http://localhost:3000](http://localhost:3000) → configure your model API key in **Settings** → start chatting.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DRISHTI_API_KEY` | No | Drishti API key for higher MCP limits |
| `DRISHTI_MCP_URL` | No | Defaults to `https://mcp.drishti.manasija.in` |
| `BETTER_AUTH_*` | No | Optional GitHub auth (not required for chat) |

## Architecture

```
src/
├── agents/          # Supervisor + specialist agents
├── mcp/             # Drishti MCP integration
├── providers/       # BYOM model adapters (AI SDK)
├── stores/          # Zustand (chat, memory, model config)
├── lib/             # Orchestrator, compliance, observability
└── app/
    ├── chat/        # Main chat UI
    ├── portfolio/   # Holdings & watchlists
    ├── settings/    # Model configuration
    └── api/chat/    # Streaming agent endpoint
```

## Example prompts

- "What happened to Reliance today?"
- "Compare TCS and Infosys."
- "Show recent announcements for HDFC Bank."
- "Analyze my portfolio."
- "Which banking stocks outperformed this quarter?"
- "Summarize today's market."

## Drishti MCP

Connect Drishti MCP in Cursor via `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "Drishti": {
      "url": "https://mcp.drishti.manasija.in"
    }
  }
}
```

Docs: [drishti.manasija.in/docs/guides/drishti-mcp](https://drishti.manasija.in/docs/guides/drishti-mcp)

## Disclaimer

Educational analysis only. Not financial advice.
