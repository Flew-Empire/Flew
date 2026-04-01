#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path


BAD_FRACTION_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\.(\d{1,5})$")


def normalize_value(value: str | None) -> str | None:
    if value in (None, ""):
        return value

    raw = value.strip()
    match = BAD_FRACTION_RE.match(raw)
    if not match:
        return raw

    base, fraction = match.groups()
    return f"{base}.{fraction.ljust(6, '0')}"


def normalize_table(cur: sqlite3.Cursor, table: str) -> int:
    datetime_cols = [
        row[1]
        for row in cur.execute(f"PRAGMA table_info({table})").fetchall()
        if "DATE" in (row[2] or "").upper() or "TIME" in (row[2] or "").upper()
    ]
    if not datetime_cols:
        return 0

    updated = 0
    rows = cur.execute(f"SELECT rowid AS __rowid__, * FROM {table}").fetchall()
    columns = [desc[0] for desc in cur.description]

    for row in rows:
        row_map = dict(zip(columns, row))
        changes: dict[str, str] = {}
        for col in datetime_cols:
            normalized = normalize_value(row_map.get(col))
            if normalized != row_map.get(col):
                changes[col] = normalized
        if not changes:
            continue

        set_clause = ", ".join(f"{col} = ?" for col in changes)
        cur.execute(
            f"UPDATE {table} SET {set_clause} WHERE rowid = ?",
            [*changes.values(), row_map["__rowid__"]],
        )
        updated += 1

    return updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="Path to sqlite database")
    args = parser.parse_args()

    db_path = Path(args.db)
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    try:
        cur.execute("BEGIN")
        results = {
            "admins": normalize_table(cur, "admins"),
            "users": normalize_table(cur, "users"),
        }
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(results)


if __name__ == "__main__":
    main()
