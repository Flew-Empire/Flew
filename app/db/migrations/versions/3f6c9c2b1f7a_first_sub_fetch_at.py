"""first_sub_fetch_at

Revision ID: 3f6c9c2b1f7a
Revises: 025d427831dd
Create Date: 2026-02-10 22:40:00
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "3f6c9c2b1f7a"
down_revision = "025d427831dd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("first_sub_fetch_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("users", "first_sub_fetch_at")
