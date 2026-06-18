import os
import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, List

logger = logging.getLogger(__name__)

class ServiceGateway:
    """HTTP adapter to the chatbot-integrations API (Postgres-backed catalogue & knowledge)."""

    def __init__(self) -> None:
        self.base_url = os.getenv("BACKEND_API_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("BACKEND_API_KEY", "")

    def enabled(self) -> bool:
        return bool(self.base_url)

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        if not self.enabled():
            return None

        url = f"{self.base_url}{endpoint}"
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")

        request = urllib.request.Request(url, data=data, method=method, headers=self._headers())
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("Backend request to %s failed: %s", url, exc)
            return None

    def get_json(self, endpoint: str) -> Any:
        """GET JSON from the integration backend (list or object)."""
        if not self.enabled():
            return None
        url = f"{self.base_url}{endpoint}"
        headers: Dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(url, method="GET", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("Backend GET %s failed: %s", url, exc)
            return None

    # These methods will eventually move to Repositories, but keeping them here for incremental refactoring backward compatibility
    def search_products(self, filters: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        response = self._request("POST", "/products/search", filters)
        if response is None:
            return None
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            products = response.get("products")
            return products if isinstance(products, list) else None
        return None

    def list_products(self) -> Optional[List[Dict[str, Any]]]:
        response = self.get_json("/admin/products/api?limit=500")
        if isinstance(response, dict):
            products = response.get("items")
            return products if isinstance(products, list) else None
        return response if isinstance(response, list) else None

    def search_stores(self, location: str) -> Optional[List[Dict[str, Any]]]:
        response = self._request("POST", "/stores/search", {"location": location})
        if response is None:
            return None
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            stores = response.get("stores")
            return stores if isinstance(stores, list) else None
        return None

    def submit_lead(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._request("POST", "/leads", payload)
gateway = ServiceGateway()
