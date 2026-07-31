import logging
from typing import Any, Dict, List, Optional

from gateway.service_gateway import ServiceGateway

logger = logging.getLogger(__name__)

class StoreRepository:
    def __init__(self, gateway: ServiceGateway):
        self.gateway = gateway

    def search_stores(self, location: str) -> Optional[List[Dict[str, Any]]]:
        try:
            return self.gateway.search_stores(location)
        except Exception as e:
            logger.error(f"Error searching stores via gateway: {e}")
            return None
