# Drishti Chat

A chat app for the Indian stock market. Ask a question in plain English and the assistant looks up live data through **Drishti MCP**: prices, top movers, company news, exchange filings, results, and earnings calls.

It is built to show what Drishti MCP can do. Every answer shows which Drishti tools were used.

## What you need

- [Bun](https://bun.sh) (or Node.js 20+)
- A **Drishti API key**: [drishti.manasija.in](https://drishti.manasija.in)
- An **AI model API key** from one of: OpenRouter, OpenAI, Anthropic, Google Gemini, or Groq (or a local Ollama model)

## Run it

```bash
cd chat-drishti-mcp
bun install
cp .env.example .env     # then put your Drishti key in DRISHTI_API_KEY
bun dev
```

Open [http://localhost:3000](http://localhost:3000). The app asks for your AI model key once, and then you can start chatting.

> If you leave `DRISHTI_API_KEY` empty, the app also asks for a Drishti key. Setting it in `.env` is easier for demos: people only need an AI model key.

## Things to try

Click a suggestion in the app, or type:

- "How did the Indian market do today?"
- "What is the latest news and exchange filings for Reliance Industries?"
- "Which companies are announcing their quarterly results this week?"
- "What did Infosys management say in their latest earnings call?"
- "How is the banking sector doing?"
- "Which stocks are trading near their 52-week high?"

**Your portfolio:** open **Settings → Portfolio**, add a few holdings, then ask "How is my portfolio doing?".

## Settings (`.env`)

| Variable | Needed? | What it does |
|----------|---------|--------------|
| `DRISHTI_API_KEY` | Recommended | Drishti key used for everyone. If empty, each user adds their own in the app. |
| `API_KEY_ENCRYPTION_SECRET` | In production | Encrypts the API keys users save in their browser. Any long random string. |
| `DRISHTI_MCP_URL` | No | Defaults to `https://mcp.drishti.manasija.in`. |

## How it works

```
Your question
    ↓
/api/chat  →  one AI agent (OpenAI Agents SDK)  ⇄  Drishti MCP tools
    ↓
Answer streams back to the chat, with each tool call shown
```

- `src/agents/drishti-agent.ts`: the agent and its instructions
- `src/mcp/drishti.ts`: connects to the Drishti MCP server
- `src/lib/orchestrator.ts`: runs the agent and streams the answer
- `src/app/api/chat/route.ts`: the chat API
- `src/components/chat/`: the chat screen and settings

Want to wire Drishti MCP into your own app? See [docs/drishti-mcp-chat-setup.md](docs/drishti-mcp-chat-setup.md).

## Use Drishti MCP in your editor

Add this to `.cursor/mcp.json` (or your MCP client's config):

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
