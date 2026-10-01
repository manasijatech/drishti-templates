# Drishti Telegram CLI

Forward Drishti's near-live WebSocket events to your private Telegram chat or a
Telegram channel. You choose the NSE/BSE watchlist and stream products; the bot formats
every populated detailed field into readable Telegram messages.

The application uses the official Python `drishti-sdk`. It reads `/v1/account` once during
startup to validate account status and WebSocket add-ons. Market events arrive through
Drishti WebSockets; the application does not use REST polling or REST catch-up.

## What you need

- Docker Desktop/Engine with Docker Compose, or Python 3.10 or newer
- A Drishti API key
- WebSocket add-ons for each stream product you want to enable
- A Telegram bot token from [BotFather](https://t.me/BotFather)

Drishti Sandbox accounts do not include live WebSocket streams. Manage plans and add-ons
in the [Drishti developer portal](https://platform.manasija.in/developer-portal).

## Setup

Run these steps from the repository directory.

### 1. Get a Drishti API key with WebSocket access

1. Open the [Drishti developer portal](https://platform.manasija.in/developer-portal).
2. Create or copy your API key.
3. Enable the WebSocket add-ons you intend to use: `news`, `block-deals`,
   `announcements`, `earnings`, `concalls`, and/or `alerts`.
4. Keep the key private. Do not add it to `config.yaml`.

The `check` command later compares every enabled stream in `config.yaml` with the account's
current WebSocket add-ons and reports all unavailable streams together.

### 2. Create the Telegram bot

1. Open the verified [@BotFather](https://t.me/BotFather) chat.
2. Send `/newbot`.
3. Enter a display name.
4. Enter a unique username ending in `bot`, such as `DrishtiAlertsExample_bot`.
5. Copy the token BotFather returns. Treat it like a password.
6. Open your new bot's chat and send `/start`.

Telegram requires a user to contact a bot before that bot can send the user private
messages. The official Telegram tutorial documents the same token and first-contact flow:
[From BotFather to Hello World](https://core.telegram.org/bots/tutorial).

If a token is exposed in a screenshot, terminal log, or commit, send `/revoke` to BotFather
and generate a replacement with `/token`.

### 3. Create `.env` and `config.yaml`

Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item config.example.yaml config.yaml
notepad .env
```

macOS or Linux:

```bash
cp .env.example .env
cp config.example.yaml config.yaml
${EDITOR:-nano} .env
```

Enter the Drishti key and Telegram token. Leave the chat ID as `pending` temporarily:

```dotenv
DRISHTI_API_KEY=your-drishti-api-key
TELEGRAM_BOT_TOKEN=your-new-telegram-bot-token
TELEGRAM_CHAT_ID=pending
```

Do not quote, share, or commit these values. Docker Compose passes `.env` into the container.
For a native installation, the CLI loads `.env` from the same directory as the selected YAML
configuration. An environment variable already set in the shell takes precedence.

### 4. Configure the watchlist and streams

Open `config.yaml` in your preferred text editor.

For normal watchlist delivery, keep `full_feed: false` and list the symbols you want:

```yaml
symbols:
  - RELIANCE
  - TCS

full_feed: false
```

Enable only streams included in your Drishti account. For example, an account with only
announcements and alerts should use:

```yaml
streams:
  news:
    enabled: false
  block-deals:
    enabled: false
  announcements:
    enabled: true
    detailed: true
    fields: ["*"]
  earnings:
    enabled: false
  concalls:
    enabled: false
  alerts:
    enabled: true
    detailed: true
    fields: ["*"]
```

`detailed: true` requests the detailed event payload. `fields: ["*"]` displays every
populated field. Null values and empty containers are omitted; `false` and `0` remain
visible. You can limit output later with an explicit field list such as:

```yaml
fields: [symbol, company_name, summary, category, date]
```

Use `full_feed: true` only with a Drishti Scale entitlement. Full-feed configuration must
use an empty symbol list:

```yaml
symbols: []
full_feed: true
```

### 5. Choose how to run the bot

Docker provides the same commands on Windows, macOS, and Linux. Native Python installation
is also supported.

#### Docker

Install Docker Desktop on Windows or macOS, or Docker Engine with the Compose plugin on
Linux. Then build the image:

```shell
docker compose build
```

After sending `/start` to your bot, retrieve the numeric private chat ID:

```shell
docker compose run --rm bot chat-id
```

Copy the printed `chat_id` into `.env`, replacing `pending`, and validate the complete setup:

```shell
docker compose run --rm bot check
```

Start the bot in the background and follow its logs:

```shell
docker compose up -d
docker compose logs -f bot
```

Press `Ctrl+C` to stop following the logs; the bot continues running. Stop and remove the
container with:

```shell
docker compose down
```

The container runs as a non-root user, mounts `config.yaml` read-only, exposes no ports, and
restarts unless explicitly stopped.

#### Native Python

Windows PowerShell:

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .
```

If PowerShell blocks activation, allow scripts for only the current terminal and activate
again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

macOS or Linux:

```bash
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

The prompt should now begin with `(.venv)`. Retrieve the numeric private chat ID:

```shell
drishti-telegram --config config.yaml chat-id
```

Copy the printed `chat_id` into `.env`, replacing `pending`, and validate the setup:

```shell
drishti-telegram --config config.yaml check
```

The command validates, in order:

1. YAML and environment configuration
2. Drishti account status and every configured WebSocket add-on
3. Telegram bot identity and access to the private chat or channel
4. Every enabled Drishti WebSocket subscription
5. The acknowledged WebSocket tier and watchlist

`check` does not send a test message. A working setup prints output similar to:

```text
OK: Telegram destination access; Drishti account: Pro; configured WebSocket streams available; acknowledged tier: pro_1000
```

Do not continue to `run` until `check` succeeds.

Start forwarding live events:

```shell
drishti-telegram --config config.yaml run
```

A successful start prints the account and acknowledged WebSocket tier. Keep the terminal
open. Stop the process with `Ctrl+C`.

Only events received while the process is online can be forwarded. There is no replay of
events missed while it was stopped.

Do not use your personal `@username` as `TELEGRAM_CHAT_ID`. Telegram's Bot API requires the
numeric ID for a private chat.

## Send to a Telegram channel instead

1. Create a Telegram channel.
2. For the simplest setup, give it a public username such as `@my_market_alerts`.
3. Add your bot as a channel administrator.
4. Enable the bot's **Post Messages** permission.
5. Set the channel username in `.env`:

```dotenv
TELEGRAM_CHAT_ID=@my_market_alerts
```

Run the applicable validation command again:

```shell
docker compose run --rm bot check
```

or:

```shell
drishti-telegram --config config.yaml check
```

A bot username and a personal Telegram username are not channel IDs.

## Common errors

| Error | Cause | Fix |
| --- | --- | --- |
| `Missing required environment variable: DRISHTI_API_KEY` | `.env` is absent, in the wrong directory, or uses the wrong variable name. | Put `.env` beside `config.yaml` and use the exact names from `.env.example`. |
| `Telegram destination check failed: Bad Request: chat not found` | A personal `@username`, bot username, or inaccessible channel was used. | For private delivery, send `/start` and use the numeric chat ID. For a channel, add the bot as an administrator and use the channel username. |
| `Telegram bot must be a channel administrator` | The bot cannot post to the configured channel. | Add it under channel **Administrators** and enable **Post Messages**. |
| `Drishti account plan Sandbox does not enable...` | Sandbox has no live WebSocket add-ons. | Enable at least one WebSocket add-on in the Drishti developer portal. |
| `does not enable the configured WebSocket streams` | `config.yaml` enables products not available to the API key. | Disable those streams or enable their add-ons, then run `check` again. |
| `did not grant full-feed access` | `full_feed: true` was used without the required entitlement. | Use a symbol watchlist with `full_feed: false`, or use an eligible Scale account. |
| `drishti-telegram` is not recognized | The virtual environment is inactive or the package is not installed. | Activate `.venv` using the command for your operating system, then run `python -m pip install -e .`. |
| `Cannot connect to the Docker daemon` | Docker Desktop or Docker Engine is not running. | Start Docker, wait until the engine is ready, and rerun the command. |

## Notification behavior

- Each stream product has a distinct Telegram heading.
- Detailed Markdown is converted to Telegram HTML, including headings, emphasis, bullets,
  quotes, separators, and tables.
- Fields are separated with blank lines; nested lists remain grouped.
- Links are clickable and link previews are disabled.
- Timestamps are displayed in IST.
- Messages are split at Telegram's 4,096-character limit.
- Sends are paced to one message per second.
- Telegram rate-limit responses use the requested cooldown.

## Delivery limits

- Drishti does not replay WebSocket events missed while the process is offline.
- Telegram sends retry five times in memory.
- A notification that still fails is logged and discarded.
- There is no persistent queue or deduplication database in v1.

Use a process supervisor if the notifier must remain online continuously.

## Development

```shell
python -m pip install -e ".[dev]"
pytest
ruff check .
ruff format --check .
mypy
```

The code is split along the operational boundaries: configuration, account validation,
event formatting, Telegram delivery, Drishti WebSocket orchestration, and the CLI entry
point.
