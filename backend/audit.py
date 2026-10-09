from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Any


# Store the database in the project root.
DB_PATH = Path(__file__).resolve().parent.parent / "payguard.db"


def current_time() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(str(DB_PATH), timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    connection = connect()

    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_request TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                currency TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                item_total REAL NOT NULL,
                shipping REAL NOT NULL,
                total REAL NOT NULL,
                decision TEXT NOT NULL,
                reason TEXT NOT NULL,
                paypal_order_id TEXT,
                paypal_status TEXT NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_audit_order_id
            ON payment_audit(paypal_order_id)
            """
        )

        connection.commit()

    finally:
        connection.close()


def record_attempt(
    *,
    user_request: str,
    product_id: str,
    product_name: str,
    currency: str,
    quantity: int,
    item_total: float,
    shipping: float,
    total: float,
    decision: str,
    reason: str,
    paypal_order_id: str | None = None,
    paypal_status: str = "NOT_CREATED",
) -> int:

    init_db()

    timestamp = current_time()
    connection = connect()

    try:
        cursor = connection.execute(
            """
            INSERT INTO payment_audit (
                created_at,
                updated_at,
                user_request,
                product_id,
                product_name,
                currency,
                quantity,
                item_total,
                shipping,
                total,
                decision,
                reason,
                paypal_order_id,
                paypal_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                timestamp,
                user_request,
                product_id,
                product_name,
                currency,
                quantity,
                item_total,
                shipping,
                total,
                decision,
                reason,
                paypal_order_id,
                paypal_status,
            ),
        )

        connection.commit()
        return int(cursor.lastrowid)

    finally:
        connection.close()


def update_order_status(
    paypal_order_id: str,
    paypal_status: str,
) -> bool:

    init_db()

    connection = connect()

    try:
        row = connection.execute(
            """
            SELECT id, decision
            FROM payment_audit
            WHERE paypal_order_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (paypal_order_id,),
        ).fetchone()

        # The order may predate audit logging.
        if row is None:
            return False

        new_decision = row["decision"]

        if paypal_status == "COMPLETED":
            new_decision = "PAYMENT_COMPLETED"

        elif paypal_status in {
            "DENIED",
            "VOIDED",
        }:
            new_decision = "PAYMENT_FAILED"

        connection.execute(
            """
            UPDATE payment_audit
            SET updated_at = ?,
                paypal_status = ?,
                decision = ?
            WHERE id = ?
            """,
            (
                current_time(),
                paypal_status,
                new_decision,
                row["id"],
            ),
        )

        connection.commit()
        return True

    finally:
        connection.close()


def list_history(limit: int = 20) -> list[dict[str, Any]]:

    init_db()

    limit = max(1, min(int(limit), 100))
    connection = connect()

    try:
        rows = connection.execute(
            """
            SELECT *
            FROM payment_audit
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()
