"""add admin_action_logs and traffic_usage tables

Revision ID: 0a1b2c3d4e5f
Revises: 3f6c9c2b1f7a, b1f3f0a9c2ab
Create Date: 2026-02-17
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0a1b2c3d4e5f"
down_revision = ("3f6c9c2b1f7a", "b1f3f0a9c2ab")
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def _has_index(bind, table_name: str, index_name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        indexes = insp.get_indexes(table_name)
    except Exception:
        return False
    return any(i.get("name") == index_name for i in indexes)


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "admin_action_logs"):
        op.create_table(
            "admin_action_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("admin_id", sa.Integer(), nullable=True),
            sa.Column("admin_username", sa.String(length=34), nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("target_type", sa.String(length=32), nullable=True),
            sa.Column("target_username", sa.String(length=34), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["admin_id"], ["admins.id"]),
        )

    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_created_at"):
        op.create_index("ix_admin_action_logs_created_at", "admin_action_logs", ["created_at"], unique=False)
    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_admin_id"):
        op.create_index("ix_admin_action_logs_admin_id", "admin_action_logs", ["admin_id"], unique=False)
    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_admin_username"):
        op.create_index("ix_admin_action_logs_admin_username", "admin_action_logs", ["admin_username"], unique=False)
    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_action"):
        op.create_index("ix_admin_action_logs_action", "admin_action_logs", ["action"], unique=False)
    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_target_type"):
        op.create_index("ix_admin_action_logs_target_type", "admin_action_logs", ["target_type"], unique=False)
    if not _has_index(bind, "admin_action_logs", "ix_admin_action_logs_target_username"):
        op.create_index("ix_admin_action_logs_target_username", "admin_action_logs", ["target_username"], unique=False)

    if not _has_table(bind, "traffic_usage"):
        op.create_table(
            "traffic_usage",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_token", sa.String(length=128), nullable=False),
            sa.Column("config_server", sa.String(length=255), nullable=False),
            sa.Column("config_port", sa.Integer(), nullable=False),
            sa.Column("protocol", sa.String(length=64), nullable=False),
            sa.Column("bytes_uploaded", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("bytes_downloaded", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("date_collected", sa.Date(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "user_token",
                "config_server",
                "config_port",
                "date_collected",
                name="uq_traffic_usage_day_key",
            ),
        )

    if not _has_index(bind, "traffic_usage", "ix_traffic_usage_user_token"):
        op.create_index("ix_traffic_usage_user_token", "traffic_usage", ["user_token"], unique=False)
    if not _has_index(bind, "traffic_usage", "ix_traffic_usage_date_collected"):
        op.create_index("ix_traffic_usage_date_collected", "traffic_usage", ["date_collected"], unique=False)
    if not _has_index(bind, "traffic_usage", "ix_traffic_usage_timestamp"):
        op.create_index("ix_traffic_usage_timestamp", "traffic_usage", ["timestamp"], unique=False)
    if not _has_index(bind, "traffic_usage", "idx_traffic_usage_server_port"):
        op.create_index("idx_traffic_usage_server_port", "traffic_usage", ["config_server", "config_port"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "traffic_usage"):
        for idx in [
            "idx_traffic_usage_server_port",
            "ix_traffic_usage_timestamp",
            "ix_traffic_usage_date_collected",
            "ix_traffic_usage_user_token",
        ]:
            if _has_index(bind, "traffic_usage", idx):
                op.drop_index(idx, table_name="traffic_usage")
        op.drop_table("traffic_usage")

    if _has_table(bind, "admin_action_logs"):
        for idx in [
            "ix_admin_action_logs_target_username",
            "ix_admin_action_logs_target_type",
            "ix_admin_action_logs_action",
            "ix_admin_action_logs_admin_username",
            "ix_admin_action_logs_admin_id",
            "ix_admin_action_logs_created_at",
        ]:
            if _has_index(bind, "admin_action_logs", idx):
                op.drop_index(idx, table_name="admin_action_logs")
        op.drop_table("admin_action_logs")
