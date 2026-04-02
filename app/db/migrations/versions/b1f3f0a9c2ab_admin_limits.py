"""add admin limits

Revision ID: b1f3f0a9c2ab
Revises: 2b231de97dc3
Create Date: 2026-02-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b1f3f0a9c2ab"
down_revision = "2b231de97dc3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admins", sa.Column("traffic_limit", sa.BigInteger(), nullable=True))
    op.add_column("admins", sa.Column("users_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("admins", "users_limit")
    op.drop_column("admins", "traffic_limit")
