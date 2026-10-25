"""最近失敗したログイン。launcherが同じ失敗を繰り返さないように覚える。このプロセスの中だけ。

siteは、ログインの失敗が続くとアカウントやアドレスをロックすることがある。鍵がアカウントの
authorized_keysに入るまで（例えばlauncherや鍵を変えた直後）、放っておくと投入と取り消しの
たびにログインして失敗し直し、1回のpollで数百回にもなる。ログインは1つのSshEndpoint
（site、アカウント、鍵）。launcherは失敗したログインを、そのpollの残りの投入では試さず、
取り消しではしばらく試さない。また動いたログイン（投入、取り消し、接続確認）の失敗は忘れる。
失敗したログインが止めている取り消しには、そのログインがまた動くまで、pollのたびではなく
1回だけ理由を知らせる。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .transport import SshEndpoint


@dataclass(frozen=True)
class LoginFailure:
    # sshが出したメッセージを伏せたもの。そのあと試さなかった投入のエラーになる。
    reason: str
    at: float
    poll: int


class LoginFailures:
    def __init__(self, *, clock: Callable[[], float]):
        self.clock = clock
        self.poll = 0
        self.failures: dict[SshEndpoint, LoginFailure] = {}
        # 最後にログインが通ってから、待っている取り消しに理由を知らせ済みの、失敗したログイン。
        self.cancels_told: set[SshEndpoint] = set()

    def start_poll(self) -> None:
        self.poll += 1

    def record(self, endpoint: SshEndpoint, reason: str, *, cancels_told: bool = False) -> None:
        """`cancels_told`: そのログインを使う取り消しが待つことを、呼び出し側が既に知らせた。"""
        self.failures[endpoint] = LoginFailure(reason=reason, at=self.clock(), poll=self.poll)
        if cancels_told:
            self.cancels_told.add(endpoint)

    def forget(self, endpoint: SshEndpoint) -> None:
        self.failures.pop(endpoint, None)
        self.cancels_told.discard(endpoint)

    def in_this_poll(self, endpoint: SshEndpoint) -> LoginFailure | None:
        failure = self.failures.get(endpoint)
        return failure if failure is not None and failure.poll == self.poll else None

    def recent(self, endpoint: SshEndpoint, seconds: float) -> LoginFailure | None:
        """`seconds`秒以内に起きていれば、そのログインの失敗。"""
        failure = self.failures.get(endpoint)
        return failure if failure is not None and self.since(failure) < seconds else None

    def since(self, failure: LoginFailure) -> float:
        return self.clock() - failure.at

    def tell_cancels_once(self, endpoint: SshEndpoint) -> bool:
        """失敗したログインを取り消しが初めて待つときにTrue。呼び出し側が理由を1回だけ知らせる。"""
        if endpoint in self.cancels_told:
            return False
        self.cancels_told.add(endpoint)
        return True
