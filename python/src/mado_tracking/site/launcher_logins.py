"""1つのsiteとアカウントについて、launcherがログインする先。SshEndpointと、それが指すファイル。

    <state dir>/known-hosts/<targetId>   siteのknown_hosts。画面から取る（0600）

アカウントの鍵は<state dir>/keys/<keyId>（launcher_keys.py）。ホスト鍵はsiteの設定からだけ
取るので、画面に鍵が無いホストは決して受け入れない。
"""

from __future__ import annotations

from pathlib import Path

from ..errors import ConfigurationError
from ..worker.contracts import require_uuid
from ..worker.installer import write_private_file
from .file_archive import PRIVATE_DIRECTORY_MODE
from .launcher_keys import LauncherKeys
from .site_settings import SiteConnection, SubmissionAccount
from .transport import SshEndpoint

KNOWN_HOSTS_DIRECTORY = "known-hosts"


class SiteLogins:
    def __init__(self, state_directory: Path, keys: LauncherKeys):
        self.directory = state_directory / KNOWN_HOSTS_DIRECTORY
        self.directory.mkdir(mode=PRIVATE_DIRECTORY_MODE, parents=True, exist_ok=True)
        self.keys = keys

    def endpoint(
        self, target_id: str, connection: SiteConnection | None, account: SubmissionAccount
    ) -> SshEndpoint:
        if connection is None:
            raise ConfigurationError("The site has no connection settings on the Web")
        if not account.account_name:
            raise ConfigurationError("The account to log in as is not known")
        if account.key_id is None:
            raise ConfigurationError("No launcher key is named for the account")
        return SshEndpoint(
            host=connection.host,
            port=connection.port,
            user=account.account_name,
            identity_file=self.keys.private_key(account.key_id),
            known_hosts=self.known_hosts(target_id, connection.known_hosts),
            jump_hosts=connection.jump_hosts,
        )

    def known_hosts(self, target_id: str, content: str) -> Path:
        """siteのknown_hostsファイル。画面の行が変わったときだけ書き直す。"""
        if not content.strip():
            raise ConfigurationError(
                "The site's known_hosts is empty; list the host keys of the site and of its jump hosts "
                "on the Web"
            )
        path = self.directory / require_uuid(target_id, "targetId")
        text = content if content.endswith("\n") else content + "\n"
        try:
            unchanged = path.read_text(encoding="utf-8") == text
        except (OSError, UnicodeDecodeError):
            unchanged = False
        if not unchanged:
            write_private_file(path, text)
        return path
