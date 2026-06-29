import logging
from typing import Any, Dict, List, Optional

from gateway.service_gateway import ServiceGateway

logger = logging.getLogger(__name__)

class LeadRepository:
    def __init__(self, gateway: ServiceGateway):
        self.gateway = gateway

    def submit_lead(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            return self.gateway.submit_lead(payload)
        except Exception as e:
            logger.error(f"Error submitting lead via gateway: {e}")
            return None
