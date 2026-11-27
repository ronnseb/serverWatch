import unittest
from unittest.mock import Mock, patch

import docker
from fastapi import HTTPException

import main


class ContainersEndpointTests(unittest.TestCase):
    def test_returns_selected_fields_for_running_and_stopped_containers(self):
        running = Mock()
        running.attrs = {
            "Name": "/web",
            "Config": {"Image": "nginx:latest", "Env": ["SECRET=value"]},
            "State": {"Status": "running", "Health": {"Status": "healthy"}},
        }
        running.name = "web"
        running.short_id = "abc123"
        running.status = "running"
        running.stats.return_value = {
            "cpu_stats": {
                "cpu_usage": {"total_usage": 300, "percpu_usage": [1, 2]},
                "system_cpu_usage": 3000,
                "online_cpus": 2,
            },
            "precpu_stats": {
                "cpu_usage": {"total_usage": 100},
                "system_cpu_usage": 1000,
            },
            "memory_stats": {"usage": 1024},
        }

        stopped = Mock()
        stopped.attrs = {
            "Name": "/old",
            "Config": {"Image": "busybox:latest"},
            "State": {"Status": "exited"},
        }
        stopped.name = "old"
        stopped.short_id = "def456"
        stopped.status = "exited"

        client = Mock()
        client.containers.list.return_value = [running, stopped]
        with patch.object(main.docker, "from_env", return_value=client) as from_env:
            result = main.get_containers()

        from_env.assert_called_once_with()
        client.containers.list.assert_called_once_with(all=True)
        client.close.assert_called_once_with()
        self.assertEqual(
            result,
            [
                {
                    "name": "web",
                    "id": "abc123",
                    "image": "nginx:latest",
                    "status": "running",
                    "health_status": "healthy",
                    "cpu_percent": 20.0,
                    "memory_usage_bytes": 1024,
                },
                {
                    "name": "old",
                    "id": "def456",
                    "image": "busybox:latest",
                    "status": "exited",
                    "health_status": None,
                    "cpu_percent": None,
                    "memory_usage_bytes": None,
                },
            ],
        )
        self.assertNotIn("Env", result[0])
        stopped.stats.assert_not_called()

    def test_docker_connection_failure_returns_service_unavailable(self):
        with patch.object(
            main.docker,
            "from_env",
            side_effect=docker.errors.DockerException("daemon unavailable"),
        ):
            with self.assertRaises(HTTPException) as error:
                main.get_containers()

        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(
            error.exception.detail,
            "Unable to connect to the Docker daemon",
        )


if __name__ == "__main__":
    unittest.main()
