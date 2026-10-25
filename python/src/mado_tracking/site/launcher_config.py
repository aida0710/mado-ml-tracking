"""launcherのTOML。起動の仕方を書く。site、job shell、アカウント、鍵は画面で設定する。

    api_url = "https://mmt.example.org"        # launcherから見たAPIの場所
    token_file = "/run/secrets/mado-tracking-launcher/launcher.token"   # mode 600
    state_directory = "/var/lib/mado-tracking-launcher"
    poll_seconds = 10
    registry_secret_file = "/run/secrets/mado-tracking-launcher/forge-pull.json"   # 任意

token_fileには、全体管理者がlauncherを登録したときに画面が1回だけ表示するtokenを入れる。
stateディレクトリは、launcherのSSHの秘密鍵と、まだ届けていない報告を持つ。再起動をまたいで
残し、launcherごとに別にする。registry_secret_fileはJSONの{"username", "password"}
（モード600）で、どのsiteのrunnerも、イメージを取ってきてSIFにするときに使う。
相対パスは、TOMLファイルのディレクトリから数える。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..errors import ConfigurationError
from ..settings import ApiSettings
from ..toml_tables import TableReader, load_toml
from ..worker.installer import InstallerError, read_token
from .credential_files import read_private_text, read_registry_secrets

DEFAULT_POLL_SECONDS = 10.0
SETTINGS = {"api_url", "token_file", "state_directory", "poll_seconds", "registry_secret_file"}
# siteを画面で設定するようになる前に、launcher.tomlが持っていたもの。
RETIRED_SETTINGS = {"launcher_id", "projects", "sites"}


def _read_token(path: Path) -> str:
    try:
        return read_token(read_private_text(path, label="token_file"))
    except InstallerError:
        raise ConfigurationError(f"token_file {path} must hold the launcher's token alone") from None


@dataclass(frozen=True)
class LauncherConfig:
    api_url: str
    token: str = field(repr=False)
    state_directory: Path
    poll_seconds: float = DEFAULT_POLL_SECONDS
    registry_secret_file: Path | None = None

    def spec_secrets(self) -> dict[str, Any] | None:
        """runner向けのsecrets.json（レジストリのログイン情報）。編集が効くよう、投入ごとに読む。"""
        if self.registry_secret_file is None:
            return None
        return read_registry_secrets(self.registry_secret_file, label="registry_secret_file")


def load_launcher_config(path: Path) -> LauncherConfig:
    table = load_toml(path)
    retired = sorted(RETIRED_SETTINGS & set(table))
    if retired:
        raise ConfigurationError(
            f"{path}: {', '.join(retired)} are no longer read. Sites, accounts and keys are set on the "
            "Web; launcher.toml keeps api_url, token_file, state_directory, poll_seconds and "
            "registry_secret_file"
        )
    reader = TableReader(table, label=str(path), allowed=SETTINGS, base_directory=path.resolve().parent)
    api_url = reader.string("api_url")
    token = _read_token(reader.path("token_file"))
    try:
        ApiSettings.from_environment(url=api_url, token=token)
    except ConfigurationError:
        raise ConfigurationError(
            f"{path}: api_url must be an HTTP(S) URL without credentials, query or fragment"
        ) from None
    config = LauncherConfig(
        api_url=api_url,
        token=token,
        state_directory=reader.path("state_directory"),
        poll_seconds=reader.number("poll_seconds", default=DEFAULT_POLL_SECONDS),
        registry_secret_file=reader.optional_path("registry_secret_file"),
    )
    # レジストリのログイン情報が壊れていれば、それを使う最初の投入ではなく、起動時に分かる。
    config.spec_secrets()
    return config
