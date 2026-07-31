import threading
from cachetools import TTLCache

class KnowledgeCache:
    """A thread-safe cache for knowledge base chunks."""
    
    def __init__(self, ttl: int = 3600, maxsize: int = 10):
        # Default TTL is 1 hour
        self.cache = TTLCache(maxsize=maxsize, ttl=ttl)
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            return self.cache.get(key)

    def set(self, key: str, value):
        with self.lock:
            self.cache[key] = value

    def clear(self):
        with self.lock:
            self.cache.clear()

knowledge_cache = KnowledgeCache()
