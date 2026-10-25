"""SDKとrunnerのプロトコルのペイロードで共有するUTCのタイムスタンプ。"""

from datetime import UTC, datetime


def utc_timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
