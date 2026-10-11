"""Names of Experiments and Models as the API saves and compares them."""

from __future__ import annotations

# What the API strips from both ends of a name before saving and comparing it (zod's .trim(), that
# is JavaScript's String.prototype.trim): its white space and line terminators. Python's own
# str.strip() differs at the edges (it keeps U+FEFF and also strips U+001C-U+001F and U+0085).
API_TRIMMED_CHARACTERS = (
    "\t\n\v\f\r              "
    "    　﻿"
)


def trim_name(name: str) -> str:
    """``name`` without the white space the API drops from either end.

    A lookup by name has to use the trimmed name: otherwise ``"exp "`` is created as ``"exp"`` and
    never found again by the name it was asked for.
    """
    return name.strip(API_TRIMMED_CHARACTERS)
