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

> **About speed:** how fast and how good the answers are depends mostly on the AI model you pick. Drishti MCP only supplies the market data. The default model is DeepSeek V4 Flash; if answers feel slow, try another model in **Settings**.

> If you leave `DRISHTI_API_KEY` empty, the app also asks for a Drishti key. Setting it in `.env` is easier for demos: people only need an AI model key.

## What you can ask

Click a suggestion in the sidebar, or type your own question.

| What | Try asking |
|------|-----------|
| Morning note | "Give me today's morning note: global cues, GIFT Nifty, and key company news." |
| Market summary | "How did the Indian market do today?" |
| F&O event risk | "Which Bank Nifty stocks have results or board meetings in the next two weeks?" |
| Negative news on index stocks | "Any negative news on Bank Nifty stocks in the last 7 days?" |
| Why a stock moved | "Which large-cap stock moved the most today, and why?" |
| Unusual volume | "Which stocks have unusually high trading volume today?" |
| Block deals | "Show the biggest block deals of the last week." |
| Company news & filings | "What is the latest news and exchange filings for Reliance Industries?" |
| Results, with source pages | "Compare the latest quarterly results of HDFC Bank and ICICI Bank." |
| Earnings calls | "What did Infosys management say in their latest earnings call?" |
| Theme discovery | "Which companies talked about capacity expansion in their latest earnings calls?" |
| Results calendar | "Which companies are announcing their quarterly results this week?" |
| Corporate actions | "List dividends, buybacks, bonus issues and stock splits from the last 7 days." |
| Red flags | "Any red flags in Nifty 50 companies in the last 30 days?" |
| Client-ready notes | "Write a short WhatsApp note for my clients on today's market." Use the copy button under the answer. |
| Hindi or Gujarati | "Give me today's market update in Gujarati." |
| Your portfolio | Add holdings in **Settings → Portfolio**, then click it under **My stocks**. |

Answers link to the original exchange filing or results page where Drishti has one.

**Not available from Drishti:** screens on ratios like PE or ROE, technical indicators like RSI or MACD, option chain and open interest, and trading. For push alerts (Telegram etc.), see the other templates in this repo: `drishti-telegram-channel`, `indian-earnings-monitor`, `corporate-action-lifecycle-monitor`, `order-win-tracker`.

## Settings (`.env`)

| Variable | Needed? | What it does |
|----------|---------|--------------|
| `DRISHTI_API_KEY` | Recommended | Drishti key used for everyone. If empty, each user adds their own in the app. When set, source links go through `/api/citation/...` so the key never reaches the browser. |
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
