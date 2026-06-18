import threading
from cachetools import TTLCache

class CatalogCache:
    """A thread-safe cache for the product catalogue DataFrame."""
    
    def __init__(self, ttl: int = 300, maxsize: int = 2):
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

# Global instance for use across the application
catalog_cache = CatalogCache(ttl=300) # 5 minutes TTL
