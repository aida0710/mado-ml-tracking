"""Run a fixed POSIX sh script on a computer and read back the tokens it prints.

The script goes to `sh -s` on stdin, so a csh login shell runs it the same way, and values reach it
only as positional arguments, never as part of the script. Scripts print every token followed by a
NUL byte (`printf '%s\\000'`), so a path with spaces or newlines arrives intact. A script keeps its
body in a `main` function that the shell reads whole before running it with stdin from /dev/null;
otherwise a command that reads stdin would swallow the rest of the script.
"""

from __future__ import annotations

from collections.abc import Sequence

from .transport import CommandTransport


async def run_posix_script(
    transport: CommandTransport,
    script: str,
    arguments: Sequence[str],
    *,
    timeout: float,  # noqa: ASYNC109 -- one complete transport operation, as in CommandTransport.run
) -> bytes:
    return await transport.run(["sh", "-s", "--", *arguments], stdin=script.encode(), timeout=timeout)


def terminated_tokens(output: bytes) -> list[bytes]:
    """The NUL-terminated tokens; whatever follows the last NUL was cut off and is dropped."""
    return output.split(b"\0")[:-1]
