"""SDKとworkerで共有する、環境変数の設定。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from .errors import ConfigurationError

# 値が無いときのエラーで示す、値の出どころ。画面ではどちらも"SDK・MLflow 3から接続"の下にある
# （Projectの設定、または実験のページの[SDKで記録]）。
API_URL_HINT = "set MMT_API_URL to the address of the web app, for example https://tracking.example.com"
API_TOKEN_HINT = (
    "issue one in the web app (project settings or [SDKで記録] on the Experiments page) and enter it "
    "with: read -r -s MMT_API_TOKEN && export MMT_API_TOKEN"
)

# 独自 API の経路の頭。ApiSettings.url はいつもこれで終わる。
API_PATH = "/api"
# ヘルスチェックは /api の外にある（コンテナのヘルスチェックと同じ経路）。
HEALTH_PATH = "/healthz"


@dataclass(frozen=True)
class ApiSettings:
    url: str
    token: str = field(repr=False)

    @classmethod
    def from_environment(cls, *, url: str | None = None, token: str | None = None) -> ApiSettings:
        api_url = (url or os.environ.get("MMT_API_URL", "")).rstrip("/")
        api_token = token or os.environ.get("MMT_API_TOKEN", "")
        parsed_url = urlsplit(api_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise ConfigurationError(f"MMT_API_URL must be an HTTP(S) URL; {API_URL_HINT}")
        if parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
            raise ConfigurationError("MMT_API_URL must not contain credentials, query, or fragment")
        if not api_token or any(character in api_token for character in "\r\n"):
            raise ConfigurationError(f"MMT_API_TOKEN is required; {API_TOKEN_HINT}")
        # originだけでも、/apiまで含めたベースURLでも受け付ける。
        if not api_url.endswith(API_PATH):
            api_url += API_PATH
        return cls(api_url, api_token)

    @property
    def health_url(self) -> str:
        """API のヘルスチェック（GET /healthz）の URL。/api の外にあるので、url の /api を外して付ける。"""
        return self.url.removesuffix(API_PATH) + HEALTH_PATH
