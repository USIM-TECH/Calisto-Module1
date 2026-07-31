import logging
from typing import Any, Dict, List, Optional
import pandas as pd

from gateway.service_gateway import ServiceGateway
from cache.catalog_cache import catalog_cache
from config.constants import PRODUCT_FIELD_ALIASES

logger = logging.getLogger(__name__)

class ProductRepository:
    def __init__(self, gateway: ServiceGateway):
        self.gateway = gateway
        self.cache = catalog_cache

    def list_products_raw(self) -> Optional[List[Dict[str, Any]]]:
        """Fetch raw products from API, with caching."""
        cache_key = "raw_products"
        cached_data = self.cache.get(cache_key)
        if cached_data is not None:
            return cached_data
            
        try:
            products = self.gateway.list_products()
            if products is not None:
                self.cache.set(cache_key, products)
            return products
        except Exception as e:
            logger.error(f"Error fetching products from gateway: {e}")
            return None
