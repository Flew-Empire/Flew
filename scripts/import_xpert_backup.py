#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_copy_rows(sql_text: str, table: str) -> list[dict[str, str | None]]:
    marker = f"COPY public.{table} ("
    start = sql_text.find(marker)
    if start == -1:
        raise ValueError(f"Table {table!r} not found in SQL dump")

    cols_end = sql_text.find(") FROM stdin;", start)
    header_end = sql_text.find("FROM stdin;\n", start)
    data_end = sql_text.find("\n\\.\n", header_end)

    cols = sql_text[start + len(marker):cols_end].split(", ")
    lines = sql_text[header_end + len("FROM stdin;\n"):data_end].strip().splitlines()

    rows: list[dict[str, str | None]] = []
    for line in lines:
        parts = line.split("\t")
        row = {}
        for key, value in zip(cols, parts):
            row[key] = None if value == r"\N" else value
        rows.append(row)
    return rows


def as_int(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def as_bool(value: str | None) -> int:
    return 1 if value == "t" else 0


def normalize_datetime(value: str | None) -> str | None:
    if value in (None, ""):
        return None

    raw = value.strip()
    match = re.match(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\.(\d{1,5})$", raw)
    if match:
        base, fraction = match.groups()
        raw = f"{base}.{fraction.ljust(6, '0')}"

    try:
        return datetime.fromisoformat(raw).isoformat(sep=" ")
    except ValueError:
        return raw


@dataclass
class ImportStats:
    inserted_admins: int = 0
    skipped_admins: int = 0
    inserted_users: int = 0
    skipped_users: int = 0
    replaced_proxy_sets: int = 0
    inserted_proxies: int = 0


def backup_db(db_path: Path) -> Path:
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.name}.before_xpert_import_{stamp}.bak")
    shutil.copy2(db_path, backup_path)
    return backup_path


def load_existing_map(cur: sqlite3.Cursor, table: str) -> dict[str, int]:
    return {username: row_id for row_id, username in cur.execute(f"SELECT id, username FROM {table}")}


def import_admins(
    cur: sqlite3.Cursor,
    rows: list[dict[str, str | None]],
) -> tuple[dict[int, int | None], ImportStats, list[str]]:
    stats = ImportStats()
    source_to_target: dict[int, int | None] = {}
    existing = load_existing_map(cur, "admins")
    conflicts: list[str] = []

    for row in rows:
        source_id = int(row["id"])
        username = (row["username"] or "").strip()
        if not username:
            source_to_target[source_id] = None
            continue

        payload = {
            "hashed_password": row["hashed_password"],
            "created_at": normalize_datetime(row["created_at"]),
            "is_sudo": as_bool(row["is_sudo"]),
            "is_disabled": 0,
            "password_reset_at": normalize_datetime(row["password_reset_at"]),
            "telegram_id": as_int(row["telegram_id"]),
            "discord_webhook": row["discord_webhook"],
            "users_usage": as_int(row["users_usage"]) or 0,
            "traffic_limit": as_int(row["traffic_limit"]),
            "users_limit": as_int(row["users_limit"]),
            "unique_ip_limit": None,
            "device_limit": None,
            # Do not preserve old external subscription domains from Xpert.
            "subscription_url_prefix": None,
        }

        if username in existing:
            target_id = existing[username]
            stats.skipped_admins += 1
            conflicts.append(username)
        else:
            cur.execute(
                """
                INSERT INTO admins (
                    username, hashed_password, created_at, is_sudo, is_disabled,
                    password_reset_at, telegram_id, discord_webhook, users_usage,
                    traffic_limit, users_limit, unique_ip_limit, device_limit,
                    subscription_url_prefix
                ) VALUES (
                    :username, :hashed_password, :created_at, :is_sudo, :is_disabled,
                    :password_reset_at, :telegram_id, :discord_webhook, :users_usage,
                    :traffic_limit, :users_limit, :unique_ip_limit, :device_limit,
                    :subscription_url_prefix
                )
                """,
                {**payload, "username": username},
            )
            target_id = int(cur.lastrowid)
            existing[username] = target_id
            stats.inserted_admins += 1

        source_to_target[source_id] = target_id

    return source_to_target, stats, conflicts


def import_users(
    cur: sqlite3.Cursor,
    rows: list[dict[str, str | None]],
    admin_id_map: dict[int, int | None],
) -> tuple[dict[int, int], ImportStats, list[dict[str, Any]]]:
    stats = ImportStats()
    source_to_target: dict[int, int] = {}
    existing = load_existing_map(cur, "users")
    conflicts: list[dict[str, Any]] = []

    for row in rows:
        source_id = int(row["id"])
        username = (row["username"] or "").strip()
        if not username:
            continue

        payload = {
            "status": row["status"],
            "used_traffic": as_int(row["used_traffic"]) or 0,
            "data_limit": as_int(row["data_limit"]),
            "data_limit_reset_strategy": row["data_limit_reset_strategy"] or "no_reset",
            "expire": as_int(row["expire"]),
            "admin_id": admin_id_map.get(as_int(row["admin_id"]) or -1),
            "sub_revoked_at": normalize_datetime(row["sub_revoked_at"]),
            "sub_updated_at": normalize_datetime(row["sub_updated_at"]),
            "first_sub_fetch_at": normalize_datetime(row["first_sub_fetch_at"]),
            "sub_last_user_agent": row["sub_last_user_agent"],
            "created_at": normalize_datetime(row["created_at"]),
            "note": row["note"],
            "online_at": normalize_datetime(row["online_at"]),
            "on_hold_expire_duration": as_int(row["on_hold_expire_duration"]),
            "on_hold_timeout": normalize_datetime(row["on_hold_timeout"]),
            "auto_delete_in_days": as_int(row["auto_delete_in_days"]),
            "edit_at": normalize_datetime(row["edit_at"]),
            "last_status_change": normalize_datetime(row["last_status_change"]),
        }

        if username in existing:
            stats.skipped_users += 1
            conflicts.append(
                {
                    "username": username,
                    "status": row["status"],
                    "expire": as_int(row["expire"]),
                    "data_limit": as_int(row["data_limit"]),
                    "source_admin_id": as_int(row["admin_id"]),
                }
            )
            continue
        else:
            cur.execute(
                """
                INSERT INTO users (
                    username, status, used_traffic, data_limit, data_limit_reset_strategy,
                    expire, admin_id, sub_revoked_at, sub_updated_at, first_sub_fetch_at,
                    sub_last_user_agent, created_at, note, online_at,
                    on_hold_expire_duration, on_hold_timeout, auto_delete_in_days,
                    edit_at, last_status_change
                ) VALUES (
                    :username, :status, :used_traffic, :data_limit, :data_limit_reset_strategy,
                    :expire, :admin_id, :sub_revoked_at, :sub_updated_at, :first_sub_fetch_at,
                    :sub_last_user_agent, :created_at, :note, :online_at,
                    :on_hold_expire_duration, :on_hold_timeout, :auto_delete_in_days,
                    :edit_at, :last_status_change
                )
                """,
                {**payload, "username": username},
            )
            target_id = int(cur.lastrowid)
            existing[username] = target_id
            stats.inserted_users += 1

        source_to_target[source_id] = target_id

    return source_to_target, stats, conflicts


def replace_proxies(
    cur: sqlite3.Cursor,
    proxy_rows: list[dict[str, str | None]],
    user_id_map: dict[int, int],
) -> ImportStats:
    stats = ImportStats()
    grouped: dict[int, list[dict[str, str | None]]] = defaultdict(list)
    for row in proxy_rows:
        source_user_id = as_int(row["user_id"])
        if source_user_id is None or source_user_id not in user_id_map:
            continue
        grouped[user_id_map[source_user_id]].append(row)

    for target_user_id, rows in grouped.items():
        proxy_ids = [
            proxy_id
            for (proxy_id,) in cur.execute("SELECT id FROM proxies WHERE user_id = ?", (target_user_id,))
        ]
        if proxy_ids:
            placeholders = ",".join("?" for _ in proxy_ids)
            cur.execute(
                f"DELETE FROM excluded_inbounds_association WHERE proxy_id IN ({placeholders})",
                proxy_ids,
            )
        cur.execute("DELETE FROM proxies WHERE user_id = ?", (target_user_id,))

        for row in rows:
            cur.execute(
                "INSERT INTO proxies (user_id, type, settings) VALUES (?, ?, ?)",
                (target_user_id, row["type"], row["settings"]),
            )
            stats.inserted_proxies += 1

        stats.replaced_proxy_sets += 1

    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql", required=True, help="Path to Xpert SQL dump")
    parser.add_argument("--db", required=True, help="Path to Flew sqlite DB")
    parser.add_argument("--execute", action="store_true", help="Apply changes")
    args = parser.parse_args()

    sql_path = Path(args.sql)
    db_path = Path(args.db)
    sql_text = sql_path.read_text()

    admin_rows = parse_copy_rows(sql_text, "admins")
    user_rows = parse_copy_rows(sql_text, "users")
    proxy_rows = parse_copy_rows(sql_text, "proxies")

    print(f"Parsed backup: admins={len(admin_rows)} users={len(user_rows)} proxies={len(proxy_rows)}")

    preview_conn = sqlite3.connect(str(db_path))
    preview_cur = preview_conn.cursor()
    existing_admins = load_existing_map(preview_cur, "admins")
    existing_users = load_existing_map(preview_cur, "users")
    preview_conn.close()

    admin_conflicts = sorted(
        row["username"] for row in admin_rows if row["username"] and row["username"] in existing_admins
    )
    user_conflicts = [
        {
            "username": row["username"],
            "status": row["status"],
            "expire": as_int(row["expire"]),
            "data_limit": as_int(row["data_limit"]),
            "source_admin_id": as_int(row["admin_id"]),
        }
        for row in user_rows
        if row["username"] and row["username"] in existing_users
    ]

    print(f"Existing admin conflicts: {len(admin_conflicts)}")
    if admin_conflicts:
        for username in admin_conflicts:
            print(f" - {username}")

    print(f"Existing user conflicts: {len(user_conflicts)}")
    if user_conflicts:
        for item in user_conflicts:
            print(
                " - "
                f"{item['username']} "
                f"(status={item['status']}, expire={item['expire']}, data_limit={item['data_limit']}, source_admin_id={item['source_admin_id']})"
            )

    if not args.execute:
        print("Dry-run only. Re-run with --execute to import.")
        return

    backup_path = backup_db(db_path)
    print(f"Backup created: {backup_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF")

    try:
        cur.execute("BEGIN")
        admin_map, admin_stats, admin_conflicts = import_admins(cur, admin_rows)
        user_map, user_stats, user_conflicts = import_users(cur, user_rows, admin_map)
        proxy_stats = replace_proxies(cur, proxy_rows, user_map)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(
        "Import complete:",
        {
            "inserted_admins": admin_stats.inserted_admins,
            "skipped_admins": admin_stats.skipped_admins,
            "inserted_users": user_stats.inserted_users,
            "skipped_users": user_stats.skipped_users,
            "proxy_sets_replaced": proxy_stats.replaced_proxy_sets,
            "inserted_proxies": proxy_stats.inserted_proxies,
        },
    )
    if admin_conflicts:
        print("Skipped existing admins:")
        for username in admin_conflicts:
            print(f" - {username}")
    if user_conflicts:
        print("Skipped existing users:")
        for item in user_conflicts:
            print(
                " - "
                f"{item['username']} "
                f"(status={item['status']}, expire={item['expire']}, data_limit={item['data_limit']}, source_admin_id={item['source_admin_id']})"
            )


if __name__ == "__main__":
    main()
