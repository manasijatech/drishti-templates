from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import Channel
from .model import ResearchEvent


class Store:
    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.state_path = self.directory / "state.json"
        self.audit_path = self.directory / "audit.jsonl"
        self._state: dict[str, Any] = self._read_state()

    def _read_state(self) -> dict[str, Any]:
        if not self.state_path.exists():
            return {"checkpoints": {}, "events": {}, "business_keys": {}}
        value = json.loads(self.state_path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("state file must contain an object")
        return value

    def _save(self) -> None:
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(self._state, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        temporary.replace(self.state_path)

    def audit(self, action: str, **details: Any) -> None:
        entry = {"audit_time": datetime.now(UTC).isoformat(), "action": action, **details}
        with self.audit_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, sort_keys=True) + "\n")

    def checkpoint(self, channel: Channel) -> str | None:
        value = self._state["checkpoints"].get(channel)
        return value if isinstance(value, str) else None

    def save_checkpoint(self, channel: Channel, source_time: str) -> None:
        current = self.checkpoint(channel)
        if current is None or source_time > current:
            self._state["checkpoints"][channel] = source_time
            self._save()
            self.audit("checkpoint_saved", channel=channel, source_time=source_time)

    def accept(self, event: ResearchEvent) -> tuple[str, ResearchEvent]:
        identity = f"{event.channel}:{event.provider_id}"
        if identity in self._state["events"]:
            return "duplicate", event
        business_key = (
            ":".join([event.channel, event.symbol, event.quarter, event.source_time[:10]])
            if event.quarter is not None
            else None
        )
        prior = self._state["business_keys"].get(business_key) if business_key else None
        status = "amendment" if prior else "accepted"
        if isinstance(prior, str):
            event.amendment_of = prior
            event.priority = "high"
        self._state["events"][identity] = event.to_dict()
        if business_key:
            self._state["business_keys"][business_key] = identity
        self._save()
        self.audit(status, identity=identity, amendment_of=event.amendment_of)
        return status, event

    def update(self, event: ResearchEvent, action: str) -> None:
        identity = f"{event.channel}:{event.provider_id}"
        self._state["events"][identity] = event.to_dict()
        self._save()
        self.audit(action, identity=identity, review_state=event.review_state)

    def events(self) -> Iterator[dict[str, Any]]:
        yield from self._state["events"].values()
