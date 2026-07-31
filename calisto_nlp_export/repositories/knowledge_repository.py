import logging
from typing import Any, Dict, List, Optional

from gateway.service_gateway import ServiceGateway
from cache.knowledge_cache import knowledge_cache

logger = logging.getLogger(__name__)

class KnowledgeRepository:
    def __init__(self, gateway: ServiceGateway):
        self.gateway = gateway
        self.cache = knowledge_cache

    def get_knowledge_chunks(self) -> Optional[List[Dict[str, Any]]]:
        """Fetch knowledge base chunks from API, with caching."""
        cache_key = "kb_chunks"
        cached_data = self.cache.get(cache_key)
        if cached_data is not None:
            return cached_data
            
        try:
            chunks = self.gateway.get_json("/knowledge/chunks")
            if chunks is not None:
                self.cache.set(cache_key, chunks)
            return chunks
        except Exception as e:
            logger.error(f"Error fetching knowledge chunks from gateway: {e}")
            return None
