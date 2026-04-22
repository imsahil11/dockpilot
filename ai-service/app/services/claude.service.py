from app.services.gemini_service import GeminiService


class ClaudeService(GeminiService):
    """Backward-compatible alias that now uses Gemini under the hood."""
