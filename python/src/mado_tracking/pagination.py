"""APIがcursorを返さなくなるまで、`{items, nextCursor}`のページをたどる。"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from typing import TYPE_CHECKING, Any

from .errors import ConfigurationError

if TYPE_CHECKING:
    from .client import Client

PageFetcher = Callable[[str | None], dict[str, Any]]


def iterate_cursor_pages(fetch_page: PageFetcher, *, label: str) -> Iterator[dict[str, Any]]:
    """すべての項目をyieldする。次のページは、前のページを使い切ってから要求する。

    ``fetch_page``は、最初のページではNoneを、以降は前の``nextCursor``を受け取る。
    ``nextCursor``が無いかnullなら走査を終える。ページングより前からあるAPIもこれで扱える。
    同じcursorが繰り返されると永遠に回り続けるので、エラーにして走査を止める。
    """
    cursor: str | None = None
    visited_cursors: set[str] = set()
    while True:
        page = fetch_page(cursor)
        items = page.get("items")
        if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
            raise ConfigurationError(f"{label} response must contain items")
        yield from items
        next_cursor = page.get("nextCursor")
        if next_cursor is None:
            return
        if not isinstance(next_cursor, str) or not next_cursor:
            raise ConfigurationError(f"{label} returned an invalid pagination cursor")
        if next_cursor in visited_cursors:
            raise ConfigurationError(f"{label} returned a repeating pagination cursor")
        visited_cursors.add(next_cursor)
        cursor = next_cursor


def iterate_listed_items(
    client: Client, path: str, *, params: Mapping[str, str], label: str
) -> Iterator[dict[str, Any]]:
    """次のページを``?cursor=``と同じ条件で要求する、GETの一覧をたどる。"""

    def fetch_page(cursor: str | None) -> dict[str, Any]:
        page_params = {**params, "cursor": cursor} if cursor else dict(params)
        # 一覧は読むだけなので、応答が失われても副作用なく再試行できる。
        return client.request("GET", path, params=page_params, retryable=True)

    return iterate_cursor_pages(fetch_page, label=label)
