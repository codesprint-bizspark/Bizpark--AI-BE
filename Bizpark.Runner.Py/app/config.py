from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

CORE_ENV = Path(__file__).resolve().parent.parent.parent / "Bizpark.Core" / ".env"


class Settings(BaseSettings):
    runner_database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/bizpark"
    runner_db_schema: str = "runner"

    # Redis — prefer REDIS_URL (Upstash / Railway Redis full URL)
    # e.g. rediss://default:token@host.upstash.io:6380
    redis_url: Optional[str] = None
    redis_host: str = "localhost"
    redis_port: int = 6379

    port: int = 3001
    public_api_url: str = "http://localhost:3000"
    api_internal_url: str = "http://localhost:3000"
    commerce_url: str = "http://localhost:3003"
    internal_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    minimax_api_key: str = ""

    # Social publishing
    token_encryption_key: str = ""
    facebook_app_secret: str = ""

    model_config = {"env_file": str(CORE_ENV), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
