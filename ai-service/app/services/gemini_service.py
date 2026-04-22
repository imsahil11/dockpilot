from __future__ import annotations

from collections.abc import AsyncIterator

import google.generativeai as genai
from google.api_core.exceptions import GoogleAPIError

from app.config import settings


class GeminiService:
    def __init__(self) -> None:
        self.api_key = settings.gemini_api_key
        self.model_name = settings.model_name
        if self.api_key:
            genai.configure(api_key=self.api_key)

    async def stream_chat(
        self,
        system_prompt: str,
        message: str,
        conversation_history: list[dict],
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        contents: list[dict] = []
        for item in conversation_history[-20:]:
            role = "model" if item.get("role") == "assistant" else "user"
            content = item.get("content") or item.get("message") or ""
            if content:
                contents.append(
                    {
                        "role": role,
                        "parts": [{"text": content}],
                    }
                )

        contents.append({"role": "user", "parts": [{"text": message}]})

        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_prompt,
        )

        try:
            stream = model.generate_content(
                contents=contents,
                stream=True,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=1024,
                    temperature=0.2,
                ),
            )

            for chunk in stream:
                try:
                    text = chunk.text
                except (AttributeError, ValueError):
                    text = ""

                if text:
                    yield text
        except GoogleAPIError as exc:
            raise RuntimeError(f"Gemini API error: {exc}") from exc
        except Exception as exc:
            raise RuntimeError(f"Gemini API error: {exc}") from exc
