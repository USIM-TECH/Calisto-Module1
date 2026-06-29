import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional local dependency
    load_dotenv = None

# Load .env file from project root when action server starts
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists() and load_dotenv is not None:
    load_dotenv(dotenv_path=env_path)
