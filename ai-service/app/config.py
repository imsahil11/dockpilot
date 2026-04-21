import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    claude_api_key: str = os.getenv("CLAUDE_API_KEY", "")
    backend_url: str = os.getenv("BACKEND_URL", "http://backend:4000")
    model_name: str = "claude-sonnet-4-20250514"


settings = Settings()
