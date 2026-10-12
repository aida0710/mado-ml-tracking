"""Request fields that an older API's strict schema refuses, and when to offer them again.

The API answers a field it does not know with 422 and does not name the field, so each 422 drops
the newest field still offered and the request goes again; a 422 accepted nothing, so sending it
again cannot claim a Job twice. A dropped field is offered again after REFUSED_FIELD_RETRY_SECONDS:
an API upgraded meanwhile takes it without a restart of this process, while an API that is still
older refuses it once more and the warning is logged again. A 422 for another reason drops fields
too, and they come back the same way.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import TypeVar

from .errors import ApiError

# The API's answer to a body its strict schema does not know (a field of a newer client).
UNKNOWN_FIELD_STATUS = 422
# How long a refused field stays dropped. An upgraded API gets the field within ten minutes; an
# older one sees one more refused request per field that often, and the warning repeats at the
# same pace while the field is not reported.
REFUSED_FIELD_RETRY_SECONDS = 600.0
LOGGER = logging.getLogger(__name__)

Response = TypeVar("Response")


class NewerRequestFields:
    """The optional fields of one kind of request, and which of them an older API refused."""

    def __init__(self, warnings: Mapping[str, str], *, clock: Callable[[], float] = time.monotonic):
        """`warnings` names each field, oldest first, with what is lost while the API refuses it."""
        self.warnings = dict(warnings)
        self.clock = clock
        self.refused_at: dict[str, float] = {}

    def offered(self) -> tuple[str, ...]:
        """The fields to send now, oldest first: those not refused, and refused ones now due."""
        now = self.clock()
        return tuple(
            name
            for name in self.warnings
            if name not in self.refused_at or now - self.refused_at[name] >= REFUSED_FIELD_RETRY_SECONDS
        )

    def drop_refused(self, error: ApiError, offered: Sequence[str]) -> bool:
        """After `error` answered a request that carried `offered`, drop the newest of them.

        Returns whether to send the request again: False when the error is not a 422 or nothing
        was left to drop.
        """
        if error.status_code != UNKNOWN_FIELD_STATUS or not offered:
            return False
        newest = offered[-1]
        self.refused_at[newest] = self.clock()
        LOGGER.warning(self.warnings[newest])
        return True

    def note_accepted(self, offered: Sequence[str]) -> None:
        """The API took a request that carried `offered`: refused ones among them are reported again."""
        for name in offered:
            if self.refused_at.pop(name, None) is not None:
                LOGGER.info("The API now takes %s; it is reported again", name)

    def send(self, request: Callable[[tuple[str, ...]], Response]) -> Response:
        """Call `request` with the fields to offer, again without each one an older API refuses."""
        while True:
            offered = self.offered()
            try:
                response = request(offered)
            except ApiError as error:
                if not self.drop_refused(error, offered):
                    raise
                continue
            self.note_accepted(offered)
            return response

    async def send_async(self, request: Callable[[tuple[str, ...]], Awaitable[Response]]) -> Response:
        """send() for a request made by a coroutine (the worker's API); the steps are the same."""
        while True:
            offered = self.offered()
            try:
                response = await request(offered)
            except ApiError as error:
                if not self.drop_refused(error, offered):
                    raise
                continue
            self.note_accepted(offered)
            return response
