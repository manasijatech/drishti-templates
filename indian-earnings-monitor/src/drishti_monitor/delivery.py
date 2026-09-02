from __future__ import annotations

from collections.abc import Callable

from .model import ResearchEvent
from .store import Store

Deliverer = Callable[[ResearchEvent], None]


def deliver_with_retry(
    event: ResearchEvent, store: Store, deliverer: Deliverer, max_attempts: int
) -> bool:
    while event.delivery_attempts < max_attempts:
        event.delivery_attempts += 1
        try:
            deliverer(event)
        except Exception as error:  # delivery adapters are an explicit retry boundary
            event.delivery_state = "retry" if event.delivery_attempts < max_attempts else "failed"
            store.audit(
                "delivery_failed",
                identity=f"{event.channel}:{event.provider_id}",
                attempt=event.delivery_attempts,
                error=type(error).__name__,
            )
            store.update(event, "delivery_queued")
        else:
            event.delivery_state = "delivered"
            store.update(event, "delivered")
            return True
    return False
