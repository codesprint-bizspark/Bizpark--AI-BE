import os
os.environ["REDIS_URL"] = "rediss://abc"
from pydantic_settings import BaseSettings
class Settings(BaseSettings):
    redis_url: str = None
    model_config = {"env_file": "nonexistent.env", "extra": "ignore"}
print(Settings().redis_url)
