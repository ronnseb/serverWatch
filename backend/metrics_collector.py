
import asyncio
import time

import psutil

from database import init_db, insert_metrics


def get_cpu_temperature():
    """Get CPU temperature if supported by the hardware."""
    try:
        temperatures = psutil.sensors_temperatures()

        if not temperatures:
            return None

        preferred = ("coretemp", "k10temp", "cpu_thermal")

        for name, sensors in temperatures.items():
            if name.lower() in preferred:
                for sensor in sensors:
                    if sensor.current is not None:
                        return float(sensor.current)

        for sensors in temperatures.values():
            for sensor in sensors:
                if sensor.current is not None:
                    return float(sensor.current)

    except (AttributeError, OSError, NotImplementedError):
        pass

    return None


def collect_metrics():
    """Collect actual system measurements from the host."""

    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_frequency = psutil.cpu_freq()

    memory = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disk = psutil.disk_usage("/")
    disk_io = psutil.disk_io_counters()

    network = psutil.net_io_counters()

    try:
        load = psutil.getloadavg()
    except (AttributeError, OSError):
        load = None

    metrics = {
        "cpu_percent": cpu_percent,
        "cpu_count": psutil.cpu_count(),
        "cpu_frequency_mhz": (
            cpu_frequency.current if cpu_frequency else None
        ),
        "cpu_temp_c": get_cpu_temperature(),

        "load_avg_1": load[0] if load else None,
        "load_avg_5": load[1] if load else None,
        "load_avg_15": load[2] if load else None,

        "ram_total_bytes": memory.total,
        "ram_used_bytes": memory.used,
        "ram_available_bytes": memory.available,
        "ram_percent": memory.percent,

        "swap_total_bytes": swap.total,
        "swap_used_bytes": swap.used,
        "swap_percent": swap.percent,

        "disk_total_bytes": disk.total,
        "disk_used_bytes": disk.used,
        "disk_free_bytes": disk.free,
        "disk_percent": disk.percent,

        "disk_read_bytes": disk_io.read_bytes if disk_io else None,
        "disk_write_bytes": disk_io.write_bytes if disk_io else None,
        "disk_read_count": disk_io.read_count if disk_io else None,
        "disk_write_count": disk_io.write_count if disk_io else None,

        "net_bytes_sent": network.bytes_sent if network else None,
        "net_bytes_recv": network.bytes_recv if network else None,
        "net_packets_sent": network.packets_sent if network else None,
        "net_packets_recv": network.packets_recv if network else None,
        "net_errors_in": network.errin if network else None,
        "net_errors_out": network.errout if network else None,
        "net_drops_in": network.dropin if network else None,
        "net_drops_out": network.dropout if network else None,

        "uptime_seconds": int(time.time() - psutil.boot_time()),
    }

    return metrics


def collect_and_store():
    """Collect one snapshot and save it to SQLite."""

    metrics = collect_metrics()
    insert_metrics(metrics)

    print(
        f"[ServerWatch] Saved metrics: "
        f"CPU={metrics['cpu_percent']}%, "
        f"RAM={metrics['ram_percent']}%, "
        f"Disk={metrics['disk_percent']}%",
        flush=True,
    )


async def metrics_collector():
    """Collect metrics approximately every 60 seconds."""

    init_db()

    while True:
        try:
            await asyncio.to_thread(collect_and_store)

        except Exception as error:
            print(
                f"[ServerWatch] Metrics collection failed: {error}",
                flush=True,
            )

        await asyncio.sleep(59)
