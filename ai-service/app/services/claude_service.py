from __future__ import annotations

from collections.abc import AsyncIterator

from anthropic import APIConnectionError, APIStatusError, AsyncAnthropic, RateLimitError

from app.config import settings


class ClaudeService:
    def __init__(self) -> None:
        self.client = AsyncAnthropic(api_key=settings.claude_api_key) if settings.claude_api_key else None

    async def stream_chat(
        self,
        system_prompt: str,
        message: str,
        conversation_history: list[dict],
    ) -> AsyncIterator[str]:
        if not self.client:
            raise RuntimeError("CLAUDE_API_KEY is not configured")

        messages: list[dict] = []
        for item in conversation_history[-20:]:
            role = "assistant" if item.get("role") == "assistant" else "user"
            content = item.get("content") or item.get("message") or ""
            if content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": message})

        try:
            async with self.client.messages.stream(
                model=settings.model_name,
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except (APIConnectionError, APIStatusError, RateLimitError) as exc:
            raise RuntimeError(f"Claude API error: {exc}") from exc
