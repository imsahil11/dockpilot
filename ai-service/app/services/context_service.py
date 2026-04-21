from __future__ import annotations

from datetime import datetime, timezone

import httpx

from app.config import settings


async def get_docker_context(auth_header: str | None = None) -> dict:
    headers: dict[str, str] = {}
    if auth_header:
        headers["Authorization"] = auth_header

    async with httpx.AsyncClient(timeout=20.0) as client:
        containers_resp = await client.get(f"{settings.backend_url}/api/containers", headers=headers)
        containers_resp.raise_for_status()
        containers = containers_resp.json()

        formatted_containers: list[dict] = []
        for container in containers:
            logs = ""
            try:
                logs_resp = await client.get(
                    f"{settings.backend_url}/api/containers/{container['id']}/logs",
                    params={"tail": 20},
                    headers=headers,
                )
                logs_resp.raise_for_status()
                logs = logs_resp.json().get("logs", "")
            except httpx.HTTPError:
                logs = ""

            formatted_containers.append(
                {
                    "id": container.get("id"),
                    "name": container.get("name"),
                    "image": container.get("image"),
                    "status": container.get("state", {}).get("status"),
                    "running": container.get("state", {}).get("running", False),
                    "cpuPercent": container.get("stats", {}).get("cpuPercent", 0),
                    "memoryMb": container.get("stats", {}).get("memoryMb", 0),
                    "networkInBytes": container.get("stats", {}).get("networkInBytes", 0),
                    "networkOutBytes": container.get("stats", {}).get("networkOutBytes", 0),
                    "last20Logs": logs.splitlines()[-20:],
                }
            )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "containers": formatted_containers,
        "totalContainers": len(formatted_containers),
        "runningContainers": len([c for c in formatted_containers if c.get("running")]),
    }
