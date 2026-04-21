from __future__ import annotations

import json
import re
import shlex
from collections.abc import AsyncIterator
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.services.claude_service import ClaudeService
from app.services.context_service import get_docker_context

router = APIRouter()
claude_service = ClaudeService()

SYSTEM_PROMPT_TEMPLATE = """You are DockPilot AI, an expert Docker assistant embedded in a Docker management platform.

CURRENT DOCKER ENVIRONMENT:
{docker_context_json}

INSTRUCTIONS:
1. Classify every message as one of three modes:
   - LEARN: User wants to understand Docker concepts. Explain clearly with examples from their actual environment.
   - SUGGEST: User wants diagnosis/recommendations. Analyse their environment and suggest solutions. Do NOT execute commands.
   - EXECUTE: User wants to run a Docker operation. Generate the exact command, wrap it in <EXECUTE>command here</EXECUTE> tags.

2. For EXECUTE mode: Always show the exact command. Never execute without user confirmation. Refuse destructive system-wide operations (docker system prune -af on all containers, etc).

3. Ground responses in the user's ACTUAL running environment. Reference their real container names, images, and metrics.

4. Keep responses concise but complete. Use markdown for code blocks.

5. For crashes/errors: check the recent logs provided and give specific diagnosis.

CONVERSATION HISTORY:
{conversation_history}
"""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversationHistory: list[ChatMessage] = Field(default_factory=list)
    userId: int


class ExecuteRequest(BaseModel):
    command: str = Field(min_length=1)
    userId: int
    chatLogId: int


def classify_mode(user_message: str, ai_response: str) -> str:
    if "<EXECUTE>" in ai_response and "</EXECUTE>" in ai_response:
        return "EXECUTE"

    lowered = user_message.lower()
    execute_verbs = ["run", "start", "stop", "restart", "remove", "exec", "deploy", "pull", "rollback"]
    learn_verbs = ["what", "why", "how", "explain", "difference", "concept", "learn"]

    if any(word in lowered for word in execute_verbs):
        return "EXECUTE"
    if any(word in lowered for word in learn_verbs):
        return "LEARN"
    return "SUGGEST"


def extract_command(ai_response: str) -> str | None:
    match = re.search(r"<EXECUTE>(.*?)</EXECUTE>", ai_response, re.DOTALL)
    if not match:
        return None
    return match.group(1).strip()


def is_command_allowed(command: str) -> bool:
    blocked_patterns = [
        r"docker\s+system\s+prune\s+-af",
        r"docker\s+rm\s+-f\s+\$\(docker\s+ps",
        r"docker\s+stop\s+\$\(docker\s+ps",
    ]
    for pattern in blocked_patterns:
        if re.search(pattern, command, flags=re.IGNORECASE):
            return False

    allowed_prefixes = (
        "docker ps",
        "docker logs",
        "docker inspect",
        "docker start",
        "docker stop",
        "docker restart",
        "docker exec",
    )
    normalized = " ".join(command.strip().split())
    return normalized.startswith(allowed_prefixes)


def conversation_to_plaintext(history: list[ChatMessage]) -> str:
    lines = []
    for item in history[-20:]:
        lines.append(f"{item.role.upper()}: {item.content}")
    return "\n".join(lines)


@router.post("/chat")
async def chat(request: Request, payload: ChatRequest) -> StreamingResponse:
    auth_header = request.headers.get("Authorization")

    async def event_stream() -> AsyncIterator[str]:
        collected = ""
        try:
            docker_context = await get_docker_context(auth_header)
            system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
                docker_context_json=json.dumps(docker_context, indent=2),
                conversation_history=conversation_to_plaintext(payload.conversationHistory),
            )

            for token in ["Analyzing your Docker environment...\n"]:
                collected += token
                yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

            async for token in claude_service.stream_chat(
                system_prompt=system_prompt,
                message=payload.message,
                conversation_history=[m.model_dump() for m in payload.conversationHistory],
            ):
                collected += token
                yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

            mode = classify_mode(payload.message, collected)
            command = extract_command(collected)
            done_event = {
                "mode": mode,
                "command": command,
                "response": collected,
                "userId": payload.userId,
            }
            yield f"event: done\ndata: {json.dumps(done_event)}\n\n"
        except Exception as exc:
            error_payload = {"error": str(exc), "partial": collected}
            yield f"event: error\ndata: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/execute")
async def execute(request: Request, payload: ExecuteRequest) -> dict:
    command = payload.command.strip()
    if not is_command_allowed(command):
        raise HTTPException(status_code=400, detail="Command is not allowed")

    auth_header = request.headers.get("Authorization")
    headers = {"Authorization": auth_header} if auth_header else {}

    tokens = shlex.split(command)
    if len(tokens) < 2:
        raise HTTPException(status_code=400, detail="Invalid command")

    async with httpx.AsyncClient(timeout=30.0) as client:
        if tokens[:2] == ["docker", "start"] and len(tokens) >= 3:
            container_id = tokens[2]
            resp = await client.post(f"{settings.backend_url}/api/containers/{container_id}/start", headers=headers)
            resp.raise_for_status()
            return {"ok": True, "result": resp.json()}

        if tokens[:2] == ["docker", "stop"] and len(tokens) >= 3:
            container_id = tokens[2]
            resp = await client.post(f"{settings.backend_url}/api/containers/{container_id}/stop", headers=headers)
            resp.raise_for_status()
            return {"ok": True, "result": resp.json()}

        if tokens[:2] == ["docker", "restart"] and len(tokens) >= 3:
            container_id = tokens[2]
            resp = await client.post(f"{settings.backend_url}/api/containers/{container_id}/restart", headers=headers)
            resp.raise_for_status()
            return {"ok": True, "result": resp.json()}

        if tokens[:2] == ["docker", "exec"] and len(tokens) >= 4:
            container_id = tokens[2]
            exec_command = " ".join(tokens[3:])
            resp = await client.post(
                f"{settings.backend_url}/api/containers/{container_id}/exec",
                headers=headers,
                json={"command": exec_command},
            )
            resp.raise_for_status()
            return {"ok": True, "result": resp.json()}

        if tokens[:2] == ["docker", "logs"] and len(tokens) >= 3:
            container_id = tokens[2]
            resp = await client.get(
                f"{settings.backend_url}/api/containers/{container_id}/logs",
                headers=headers,
                params={"tail": 100},
            )
            resp.raise_for_status()
            return {"ok": True, "result": resp.json()}

        if tokens[:2] in (["docker", "ps"], ["docker", "inspect"]):
            resp = await client.get(f"{settings.backend_url}/api/containers", headers=headers)
            resp.raise_for_status()
            containers = resp.json()
            if tokens[:2] == ["docker", "inspect"] and len(tokens) >= 3:
                container_id = tokens[2]
                detail_resp = await client.get(
                    f"{settings.backend_url}/api/containers/{container_id}", headers=headers
                )
                detail_resp.raise_for_status()
                return {"ok": True, "result": detail_resp.json()}
            return {"ok": True, "result": containers}

    raise HTTPException(status_code=400, detail="Unsupported command form")
