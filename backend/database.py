
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent / "data" / "serverwatch.db"

METRICS_RETENTION_DAYS = 90


@contextmanager
def get_connection():
    """Open a database connection and safely commit or roll back."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row

    try:
        conn.execute("PRAGMA foreign_keys = ON")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create all database tables and indexes"""

    with get_connection() as conn:

        # system performance metrics
        conn.execute("""
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,

                cpu_percent REAL,
                cpu_count INTEGER,
                cpu_frequency_mhz REAL,
                cpu_temp_c REAL,
                load_avg_1 REAL,
                load_avg_5 REAL,
                load_avg_15 REAL,

                ram_total_bytes INTEGER,
                ram_used_bytes INTEGER,
                ram_available_bytes INTEGER,
                ram_percent REAL,

                swap_total_bytes INTEGER,
                swap_used_bytes INTEGER,
                swap_percent REAL,

                disk_total_bytes INTEGER,
                disk_used_bytes INTEGER,
                disk_free_bytes INTEGER,
                disk_percent REAL,
                disk_read_bytes INTEGER,
                disk_write_bytes INTEGER,
                disk_read_count INTEGER,
                disk_write_count INTEGER,

                net_bytes_sent INTEGER,
                net_bytes_recv INTEGER,
                net_packets_sent INTEGER,
                net_packets_recv INTEGER,
                net_errors_in INTEGER,
                net_errors_out INTEGER,
                net_drops_in INTEGER,
                net_drops_out INTEGER,

                uptime_seconds INTEGER
            )
        """)

        # Docker container metrics history
        conn.execute("""
            CREATE TABLE IF NOT EXISTS container_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,

                container_id TEXT NOT NULL,
                container_name TEXT NOT NULL,
                image TEXT,

                status TEXT,
                health_status TEXT,

                cpu_percent REAL,
                memory_usage_bytes INTEGER,
                memory_limit_bytes INTEGER,

                network_rx_bytes INTEGER,
                network_tx_bytes INTEGER,

                restart_count INTEGER,
                started_at TEXT,
                exit_code INTEGER
            )
        """)

        # events, state changes
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                timestamp INTEGER NOT NULL,
                resolved_timestamp INTEGER,

                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,

                title TEXT NOT NULL,
                description TEXT,

                source TEXT,
                container_id TEXT,

                metric_name TEXT,
                metric_value REAL,
                threshold_value REAL,

                resolved INTEGER NOT NULL DEFAULT 0
            )
        """)

        # Service availability and response times
        conn.execute("""
            CREATE TABLE IF NOT EXISTS service_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,

                service_name TEXT NOT NULL,
                service_type TEXT,

                available INTEGER NOT NULL,
                response_time_ms REAL,

                status_code INTEGER,
                error_message TEXT
            )
        """)

        # hardware and operating system information
        conn.execute("""
            CREATE TABLE IF NOT EXISTS host_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                recorded_at INTEGER NOT NULL,

                hostname TEXT,
                operating_system TEXT,
                os_version TEXT,
                kernel_version TEXT,

                cpu_model TEXT,
                cpu_cores INTEGER,
                cpu_threads INTEGER,

                ram_total_bytes INTEGER,

                docker_version TEXT,
                serverwatch_version TEXT
            )
        """)

        # llm explanations and insights
        conn.execute("""
            CREATE TABLE IF NOT EXISTS insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                created_at INTEGER NOT NULL,

                period_start INTEGER,
                period_end INTEGER,

                insight_type TEXT,
                severity TEXT,

                title TEXT NOT NULL,
                explanation TEXT NOT NULL,
                recommendation TEXT,

                evidence_json TEXT,
                model_name TEXT
            )
        """)

        # improves historical queries
        indexes = [
            ("idx_system_metrics_timestamp",
             "system_metrics", "timestamp"),

            ("idx_container_metrics_timestamp",
             "container_metrics", "timestamp"),

            ("idx_container_metrics_name",
             "container_metrics", "container_name"),

            ("idx_events_timestamp",
             "events", "timestamp"),

            ("idx_events_severity",
             "events", "severity"),

            ("idx_service_checks_timestamp",
             "service_checks", "timestamp"),

            ("idx_service_checks_name",
             "service_checks", "service_name"),

            ("idx_insights_created",
             "insights", "created_at"),
        ]

        for index_name, table_name, column_name in indexes:
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS {index_name} "
                f"ON {table_name}({column_name})"
            )


def insert_metrics(metrics):
    """Save one system metrics"""

    now = int(time.time())

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO system_metrics (
                timestamp,
                cpu_percent, cpu_count, cpu_frequency_mhz,
                cpu_temp_c, load_avg_1, load_avg_5, load_avg_15,

                ram_total_bytes, ram_used_bytes,
                ram_available_bytes, ram_percent,

                swap_total_bytes, swap_used_bytes, swap_percent,

                disk_total_bytes, disk_used_bytes,
                disk_free_bytes, disk_percent,
                disk_read_bytes, disk_write_bytes,
                disk_read_count, disk_write_count,

                net_bytes_sent, net_bytes_recv,
                net_packets_sent, net_packets_recv,
                net_errors_in, net_errors_out,
                net_drops_in, net_drops_out,

                uptime_seconds
            )
            VALUES (
                :timestamp,
                :cpu_percent, :cpu_count, :cpu_frequency_mhz,
                :cpu_temp_c, :load_avg_1, :load_avg_5, :load_avg_15,

                :ram_total_bytes, :ram_used_bytes,
                :ram_available_bytes, :ram_percent,

                :swap_total_bytes, :swap_used_bytes, :swap_percent,

                :disk_total_bytes, :disk_used_bytes,
                :disk_free_bytes, :disk_percent,
                :disk_read_bytes, :disk_write_bytes,
                :disk_read_count, :disk_write_count,

                :net_bytes_sent, :net_bytes_recv,
                :net_packets_sent, :net_packets_recv,
                :net_errors_in, :net_errors_out,
                :net_drops_in, :net_drops_out,

                :uptime_seconds
            )
        """, {**metrics, "timestamp": now})

        # Remove old detailed system measurements.
        cutoff = now - METRICS_RETENTION_DAYS * 86400

        conn.execute(
            "DELETE FROM system_metrics WHERE timestamp < ?",
            (cutoff,)
        )


def get_history(hours=24):
    """Return historical system metrics for the requested period"""

    if not 1 <= hours <= METRICS_RETENTION_DAYS * 24:
        raise ValueError("Hours must be between 1 and 2160.")

    cutoff = int(time.time()) - hours * 3600

    with get_connection() as conn:
        rows = conn.execute("""
            SELECT *
            FROM system_metrics
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
        """, (cutoff,)).fetchall()

        return [dict(row) for row in rows]


def insert_event(
    event_type,
    severity,
    title,
    description=None,
    source=None,
    container_id=None,
    metric_name=None,
    metric_value=None,
    threshold_value=None,
):
    """Record an alert or important server event."""

    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO events (
                timestamp, event_type, severity,
                title, description, source,
                container_id, metric_name,
                metric_value, threshold_value
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            int(time.time()),
            event_type,
            severity,
            title,
            description,
            source,
            container_id,
            metric_name,
            metric_value,
            threshold_value,
        ))

        return cursor.lastrowid


def insert_service_check(
    service_name,
    available,
    response_time_ms=None,
    service_type=None,
    status_code=None,
    error_message=None,
):
    """Save the result of a service availability check."""

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO service_checks (
                timestamp, service_name, service_type,
                available, response_time_ms,
                status_code, error_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            int(time.time()),
            service_name,
            service_type,
            int(bool(available)),
            response_time_ms,
            status_code,
            error_message,
        ))


def insert_insight(
    title,
    explanation,
    recommendation=None,
    insight_type=None,
    severity=None,
    period_start=None,
    period_end=None,
    evidence_json=None,
    model_name=None,
):
    """Save an LLM-generated explanation and its supporting evidence."""

    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO insights (
                created_at, period_start, period_end,
                insight_type, severity, title,
                explanation, recommendation,
                evidence_json, model_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            int(time.time()),
            period_start,
            period_end,
            insight_type,
            severity,
            title,
            explanation,
            recommendation,
            evidence_json,
            model_name,
        ))

        return cursor.lastrowid
