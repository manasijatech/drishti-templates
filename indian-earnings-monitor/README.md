# Drishti Indian Earnings Monitor

Watch earnings, news, and conference calls for a list of Indian companies.

The monitor saves matching updates in a local queue. It does not place trades, publish content,
or send messages.

## Quick start

Run these commands from the `indian-earnings-monitor` folder.

### 1. Install the monitor

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
```

Activate the environment again when you open a new terminal:

```bash
source .venv/bin/activate
```

### 2. Choose the companies to watch

Open `config.example.json`:

```bash
nano config.example.json
```

The included file watches `RELIANCE` and `TCS`. Change the symbols or add more entries under
`coverage`. This is the smallest working example:

```json
{
  "coverage": [
    {
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "owner": "energy-desk",
      "priority": "high",
      "channels": ["earnings", "news", "concalls"]
    }
  ]
}
```

- `symbol`: NSE or BSE trading symbol.
- `owner`: your internal label for the person or team reviewing updates.
- `priority`: `normal` or `high`.
- `channels`: choose `earnings`, `news`, and/or `concalls`.

### 3. Add your API key

Set the key in the current terminal:

```bash
export DRISHTI_API_KEY='YOUR_API_KEY'
```

Do not put the key in `config.example.json` or commit it to Git.

### 4. Fetch updates once

```bash
drishti-monitor check
```

Example output:

```text
accepted=2 calendar=1 queue=7
```

- `accepted=2`: two new updates were found during this check.
- `calendar=1`: one upcoming earnings or concall date was saved.
- `queue=7`: seven updates are now stored in total.

`accepted=0` is not an error. It means there were no new updates since the last check.

### 5. Monitor live updates

```bash
drishti-monitor run
```

Leave this command running. New matching events will appear in the terminal and be added to the
queue. Press `Ctrl+C` to stop.

Live WebSocket monitoring requires the Starter plan or higher. Sandbox keys can still use
`check`. If your key has no WebSocket access, the monitor will show this link:

[Purchase the Starter plan](https://platform.manasija.in/developer-portal/plans)

### 6. View saved results

Show every saved update:

```bash
drishti-monitor queue
```

Show upcoming earnings and concall dates:

```bash
drishti-monitor calendar
```

## Commands

| Command | What it does |
| --- | --- |
| `drishti-monitor demo` | Runs a safe sample without an API key or network call. |
| `drishti-monitor check` | Fetches new updates once and exits. |
| `drishti-monitor run` | Watches for live updates until you stop it. |
| `drishti-monitor queue` | Shows all saved updates. |
| `drishti-monitor calendar` | Shows saved earnings and concall dates. |

## Where the data is saved

The monitor creates a `var` folder automatically:

- `var/state.json` stores the queue, calendar, and checkpoints.
- `var/audit.jsonl` stores a history of actions and errors.

Checkpoints prevent the same update from being added again after a restart. Keep the `var` folder
if you want the monitor to remember its progress.

To use another folder:

```bash
drishti-monitor --state-dir my-state check
```

## Use another configuration file

The default file is `config.example.json`. To use a different file:

```bash
drishti-monitor --config my-companies.json check
drishti-monitor --config my-companies.json run
```

Options such as `--config`, `--state-dir`, and `--json` must come before the command.

## Common problems

### “Live monitoring needs a Drishti API key”

Set the key again in the current terminal:

```bash
export DRISHTI_API_KEY='YOUR_API_KEY'
```

### “Wait one minute, then try again”

The API key reached its per-minute request limit. Wait one minute before running `check` again.
The monitor reuses a recent successful check when you start `run`, so it avoids duplicate calls.

### The live monitor shows no updates

This can be normal. The connection stays open and waits for a matching earnings, news, or concall
event. Quiet periods produce no output.

### The key has no WebSocket access

Use `drishti-monitor check` for REST polling, or
[purchase the Starter plan](https://platform.manasija.in/developer-portal/plans) for live streams.

## What happens behind the scenes

1. `check` asks Drishti for recent earnings, news, concalls, and upcoming dates.
2. The monitor keeps only the symbols and channels in your configuration.
3. New records are added to the local queue and assigned to the configured owner.
4. `run` uses the Drishti Python SDK to receive new events over WebSocket.
5. The SDK handles authentication, reconnects, and subscription replay.

The monitor uses the official `drishti-sdk` package. REST checks can consume Drishti credits.
WebSocket streams require a paid plan but do not consume REST credits.

## Limits

- This is a single-process local template, not a hosted service.
- It does not place broker orders.
- It does not send Slack, email, or other notifications by itself.
- It does not create AI summaries.
- The local JSON store is not designed for several processes writing at the same time.

## Developer checks

Install the development tools and run the test suite:

```bash
python -m pip install -e '.[dev]'
ruff format --check .
ruff check .
mypy --strict
pytest
python -m build
```

## Drishti documentation

- [Python SDK](https://drishti.manasija.in/docs/sdks/python)
- [Authentication](https://drishti.manasija.in/docs/guides/authentication)
- [WebSocket streams](https://drishti.manasija.in/docs/guides/websockets)
- [Plans](https://platform.manasija.in/developer-portal/plans)
