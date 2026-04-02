from __future__ import annotations

from typing import Iterable, Set

CANONICAL_EDITIONS = ("free", "start", "pro", "x")

EDITION_ALIASES = {
    "free": "free",
    "standard": "free",
    "start": "start",
    "full": "pro",
    "pro": "pro",
    "custom": "x",
    "x": "x",
}


def normalize_edition_name(value: str | None, default: str = "") -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        return default
    return EDITION_ALIASES.get(normalized, normalized)


def valid_edition_names() -> Set[str]:
    return set(CANONICAL_EDITIONS)


def is_valid_edition_name(value: str | None) -> bool:
    return normalize_edition_name(value) in valid_edition_names()


def normalize_edition_values(values: Iterable[str]) -> Set[str]:
    return {
        normalized
        for normalized in (normalize_edition_name(value) for value in values)
        if normalized
    }
