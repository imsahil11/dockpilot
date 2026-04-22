import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", os.getenv("CLAUDE_API_KEY", ""))
    backend_url: str = os.getenv("BACKEND_URL", "http://backend:4000")
    model_name: str = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")


settings = Settings()
