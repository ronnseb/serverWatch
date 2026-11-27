import socket
import time

import docker
import psutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ServerWatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "ServerWatch API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/metrics")
def get_metrics():
    return {
        "hostname": socket.gethostname(),
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "ram_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage("/").percent,
        "uptime_seconds": int(time.time() - psutil.boot_time()),
    }


def _cpu_percent(stats):
    try:
        cpu_stats = stats["cpu_stats"]
        precpu_stats = stats["precpu_stats"]
        cpu_delta = (
            cpu_stats["cpu_usage"]["total_usage"]
            - precpu_stats["cpu_usage"]["total_usage"]
        )
        system_delta = cpu_stats["system_cpu_usage"] - precpu_stats["system_cpu_usage"]
        cpu_count = cpu_stats.get("online_cpus") or len(
            cpu_stats["cpu_usage"].get("percpu_usage", [])
        )
    except (KeyError, TypeError):
        return None

    if cpu_delta <= 0 or system_delta <= 0 or cpu_count <= 0:
        return None
    return round((cpu_delta / system_delta) * cpu_count * 100, 2)


@app.get("/containers")
def get_containers():
    client = None
    try:
        client = docker.from_env()
        containers = client.containers.list(all=True)
        result = []

        for container in containers:
            try:
                container.reload()
            except docker.errors.NotFound:
                continue

            attrs = container.attrs
            state = attrs.get("State", {})
            status = state.get("Status") or container.status
            health = state.get("Health", {}).get("Status")
            cpu_percent = None
            memory_usage_bytes = None

            if status == "running":
                try:
                    stats = container.stats(stream=False)
                except docker.errors.NotFound:
                    stats = None
                if stats:
                    cpu_percent = _cpu_percent(stats)
                    memory_usage_bytes = stats.get("memory_stats", {}).get("usage")

            result.append(
                {
                    "name": attrs.get("Name", container.name).lstrip("/"),
                    "id": container.short_id,
                    "image": attrs.get("Config", {}).get("Image", ""),
                    "status": status,
                    "health_status": health,
                    "cpu_percent": cpu_percent,
                    "memory_usage_bytes": memory_usage_bytes,
                }
            )

        return result
    except docker.errors.DockerException as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to connect to the Docker daemon",
        ) from exc
    finally:
        if client is not None:
            client.close()

