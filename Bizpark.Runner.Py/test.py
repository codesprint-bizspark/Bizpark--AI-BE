import os
os.environ["REDIS_URL"] = "abc"
from pydantic_settings import BaseSettings
from typing import Optional
class Settings(BaseSettings):
    redis_url: Optional[str] = None
print("Result:", Settings().redis_url)
