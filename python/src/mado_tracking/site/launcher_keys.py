"""launcherのSSHの鍵。ssh-keygenがここで作り、APIには公開鍵だけを送る。

    <state dir>/keys/        0700
      <keyId>                0600の秘密鍵。このホストから出ない
      <keyId>.pub            PUT /launcher/keys/:idで送る形の、その公開鍵

pollのたびに、ファイルとGET /launcher/configが並べる鍵を比べる。一覧にあってファイルが無い
鍵は、作って公開する。まだ`requested`の鍵や、公開済みの鍵がディスクのものと違う鍵は、
公開し直す。一覧に無くなった鍵（失効したか、置き換えた）のファイルは消す。
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path

from ..errors import ApiError, ConfigurationError
from ..security import SecretMasker
from ..worker.contracts import require_uuid
from .file_archive import PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE
from .launcher_assignment import LauncherKey

LOGGER = logging.getLogger(__name__)
KEYS_DIRECTORY = "keys"
PUBLIC_KEY_SUFFIX = ".pub"
# APIはed25519の鍵しか受け付けない（それ以外はinvalid_public_key）。
KEY_TYPE = "ed25519"
PUBLIC_KEY_LINE = re.compile(r"^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [^\r\n\x00]*)?$")
# ssh-keygenがed25519の鍵を作るのにかかる時間は、1秒よりずっと短い。
KEYGEN_TIMEOUT_SECONDS = 60.0
# APIが受け付けるコメントは300文字まで。名前の部分は、それに十分収まる長さにする。
MAX_COMMENT_NAME_CHARACTERS = 100
# (keyId, 公開鍵の行) -> None。APIが拒んだらApiErrorを投げる。
KeyPublisher = Callable[[str, str], None]


def key_comment(launcher_name: str, key_id: str) -> str:
    """mmt-launcher:<launcher name>:<keyId>。鍵の行のフィールドが3つのままになるよう1語にする。"""
    name = "".join(
        character if character.isprintable() and not character.isspace() else "-"
        for character in launcher_name[:MAX_COMMENT_NAME_CHARACTERS]
    )
    return f"mmt-launcher:{name}:{key_id}"


def key_material(public_key: str) -> str:
    """鍵の種類とblob。コメントが違っても、別の鍵にはならない。"""
    return " ".join(public_key.split()[:2])


def _key_id_of(file_name: str) -> str | None:
    try:
        return require_uuid(file_name.removesuffix(PUBLIC_KEY_SUFFIX), "keyId")
    except ConfigurationError:
        return None


class LauncherKeys:
    def __init__(self, state_directory: Path, *, masker: SecretMasker):
        self.directory = state_directory / KEYS_DIRECTORY
        self.directory.mkdir(mode=PRIVATE_DIRECTORY_MODE, parents=True, exist_ok=True)
        # 既にあるディレクトリのモードはmkdirでは変わらない。秘密鍵を置くので閉じる必要がある。
        os.chmod(self.directory, PRIVATE_DIRECTORY_MODE)
        self.masker = masker

    def private_key(self, key_id: str) -> Path:
        return self.directory / require_uuid(key_id, "keyId")

    def _public_key_file(self, key_id: str) -> Path:
        return self.directory / f"{require_uuid(key_id, 'keyId')}{PUBLIC_KEY_SUFFIX}"

    def public_key(self, key_id: str) -> str | None:
        """ディスク上の完全な鍵の、公開鍵の行。どちらかが欠けていればNone。"""
        if not self.private_key(key_id).is_file():
            return None
        try:
            line = self._public_key_file(key_id).read_text(encoding="utf-8").strip()
        except (OSError, UnicodeDecodeError):
            return None
        return line if PUBLIC_KEY_LINE.fullmatch(line) else None

    def create(self, key_id: str, *, comment: str) -> str:
        """ssh-keygenで鍵を作り、以前の不完全な試行を置き換える。公開鍵を返す。"""
        private_key = self.private_key(key_id)
        private_key.unlink(missing_ok=True)
        self._public_key_file(key_id).unlink(missing_ok=True)
        # 引数は分けて渡し、シェルは通さない。コメントには画面で付けたlauncherの名前が入る。
        argv = ["ssh-keygen", "-q", "-t", KEY_TYPE, "-N", "", "-C", comment, "-f", str(private_key)]
        try:
            completed = subprocess.run(
                argv,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=KEYGEN_TIMEOUT_SECONDS,
                check=False,
            )
        except OSError:
            raise ConfigurationError("ssh-keygen could not be started; the launcher needs OpenSSH") from None
        except subprocess.TimeoutExpired:
            raise ConfigurationError(
                f"ssh-keygen did not finish within {KEYGEN_TIMEOUT_SECONDS:.0f} seconds"
            ) from None
        if completed.returncode:
            detail = self.masker.mask(completed.stderr.decode("utf-8", "replace")).strip()
            raise ConfigurationError(f"ssh-keygen exited with status {completed.returncode}: {detail}")
        os.chmod(private_key, PRIVATE_FILE_MODE)
        public_key = self.public_key(key_id)
        if public_key is None:
            raise ConfigurationError("ssh-keygen wrote no ssh-ed25519 key pair")
        return public_key

    def synchronize(self, keys: Sequence[LauncherKey], *, launcher_name: str, publish: KeyPublisher) -> None:
        """APIが並べるものを作って公開し、そのあと一覧に無くなった鍵を消す。"""
        for key in keys:
            try:
                self._synchronize(key, launcher_name=launcher_name, publish=publish)
            except (ConfigurationError, OSError) as error:
                LOGGER.error(
                    "Key %s for site %s could not be made or published: %s",
                    key.id,
                    key.target_id,
                    self.masker.mask(str(error)),
                )
            except ApiError as error:
                # 409 site_key_revoked。次の設定ではもう一覧に無く、鍵は消される。
                LOGGER.warning(
                    "Key %s for site %s was not published: %s",
                    key.id,
                    key.target_id,
                    self.masker.mask(str(error)),
                )
        self.remove_unlisted({key.id for key in keys})

    def _synchronize(self, key: LauncherKey, *, launcher_name: str, publish: KeyPublisher) -> None:
        public_key = self.public_key(key.id)
        if public_key is None:
            public_key = self.create(key.id, comment=key_comment(launcher_name, key.id))
            LOGGER.info("Made key %s for site %s", key.id, key.target_id)
        elif (
            not key.requested
            and key.public_key is not None
            and key_material(key.public_key) == key_material(public_key)
        ):
            return
        publish(key.id, public_key)
        LOGGER.info("Published key %s for site %s", key.id, key.target_id)

    def remove_unlisted(self, live_key_ids: set[str]) -> None:
        for path in self.directory.iterdir():
            key_id = _key_id_of(path.name)
            if key_id is None or key_id in live_key_ids or path.is_dir():
                continue
            path.unlink(missing_ok=True)
            if not path.name.endswith(PUBLIC_KEY_SUFFIX):
                LOGGER.info("Deleted key %s, which the API no longer lists", key_id)
