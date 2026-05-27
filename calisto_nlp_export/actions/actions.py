import json
import logging
import os
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from difflib import get_close_matches
from functools import lru_cache
from typing import Any, Dict, List, Optional, Text

import pandas as pd
from rasa_sdk import Action, Tracker
from rasa_sdk.events import ActiveLoop, FollowupAction, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.forms import FormValidationAction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOOKING_URL = os.getenv("BOOKING_URL", "").strip()
DEFAULT_STORE_HOURS = os.getenv("DEFAULT_STORE_HOURS", "10:00 AM to 10:00 PM daily").strip()
INTENT_CONFIDENCE_THRESHOLD = 0.7
FORM_INTERRUPTION_INTENTS = {
    "ask_faq",
    "ask_pricing",
    "select_pricing_category",
    "browse_eyewear",
    "select_product_type",
    "select_brand",
    "select_budget",
    "ask_lens_type",
    "lens_vision_solutions",
    "find_a_store",
    "store_hours",
    "choose_city",
    "search_product",
    "search_product_by_attribute",
    "product_recommendation",
    "inform_budget",
    "email_support",
}
FLOW_BY_INTENT = {
    "ask_faq": "faq",
    "ask_pricing": "pricing",
    "select_pricing_category": "pricing",
    "browse_eyewear": "browse_eyewear",
    "select_product_type": "browse_eyewear",
    "select_brand": "browse_eyewear",
    "select_budget": "browse_eyewear",
    "ask_lens_type": "lens_consultation",
    "lens_vision_solutions": "lens_consultation",
    "find_a_store": "store_lookup",
    "store_hours": "store_lookup",
    "choose_city": "store_lookup",
    "search_product": "product_search",
    "search_product_by_attribute": "product_search",
    "product_recommendation": "product_recommendation",
    "inform_budget": "product_search",
}


def resolve_interruption_flow(tracker: Tracker, intent_name: str) -> str:
    if intent_name != "select_budget":
        return FLOW_BY_INTENT.get(intent_name, "interrupted")

    current_flow = str(tracker.get_slot("current_flow") or "").strip()
    if current_flow in {"lens_consultation", "product_search", "browse_eyewear", "pricing"}:
        return current_flow

    preferred_service = str(tracker.get_slot("preferred_service") or "").lower()
    lens_type = tracker.get_slot("lens_type")
    product_type = str(tracker.get_slot("product_type") or "").lower()

    if lens_type or "lens" in preferred_service:
        return "lens_consultation"
    if product_type or "frame" in preferred_service or "sunglass" in preferred_service:
        return "browse_eyewear"
    return "product_search"


PERSISTENT_SLOTS = {
    "lead_name",
    "contact_number",
    "email",
    "lead_location",
    "preferred_service",
    "purchase_timeline",
    "lead_status",
}

MANAGED_SLOTS = {
    "product_type",
    "brand",
    "price_range",
    "lens_type",
    "city",
    "use_case",
    "urgency",
    "order_id",
    "frame_color",
    "frame_shape",
    "frame_material",
    "budget",
    "budget_min",
    "budget_max",
    "budget_bucket",
    "gender",
    *PERSISTENT_SLOTS,
}

FLOW_ALLOWED_SLOTS: Dict[str, set] = {
    "faq": set(),
    "pricing": set(),
    "browse_eyewear": {
        "product_type",
        "brand",
        "price_range",
        "frame_color",
        "frame_shape",
        "frame_material",
        "budget",
        "budget_min",
        "budget_max",
        "budget_bucket",
        "gender",
    },
    "lens_consultation": {"lens_type", "price_range"},
    "store_lookup": {"city"},
    "product_search": {
        "product_type",
        "brand",
        "price_range",
        "frame_color",
        "frame_shape",
        "frame_material",
        "budget",
        "budget_min",
        "budget_max",
        "budget_bucket",
        "use_case",
        "gender",
    },
    "product_recommendation": {"product_type", "brand", "budget", "use_case", "urgency", "gender"},
    "lead_capture": set(PERSISTENT_SLOTS),
}


def flow_entry_events(tracker: Tracker, target_flow: str) -> List[Dict[Text, Any]]:
    """Centralized flow transition: set current_flow and clear slots that don't belong.

    We avoid clearing lead-capture slots (PERSISTENT_SLOTS) so we don't lose collected info.
    """

    allowed = set(FLOW_ALLOWED_SLOTS.get(target_flow, set())) | set(PERSISTENT_SLOTS)
    clearable = set(MANAGED_SLOTS) - set(PERSISTENT_SLOTS)
    to_clear = sorted(slot for slot in clearable if slot not in allowed)

    events: List[Dict[Text, Any]] = [SlotSet("current_flow", target_flow)]
    for slot_name in to_clear:
        if tracker.get_slot(slot_name) is not None:
            events.append(SlotSet(slot_name, None))
    return events


def normalize_city_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[\[\]{}()\.,;:!?'\"]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


@lru_cache(maxsize=1)
def city_key_registry() -> Dict[str, str]:
    cities = unique_cities(load_catalogue())
    registry: Dict[str, str] = {}
    for city in cities:
        key = normalize_city_key(city)
        if key:
            registry[key] = city
            registry[key.replace(" ", "")] = city

    # Common abbreviations / aliases.
    if "kuala lumpur" in registry:
        registry.setdefault("kl", registry["kuala lumpur"])
        registry.setdefault("k l", registry["kuala lumpur"])
        registry.setdefault("k.l", registry["kuala lumpur"])
        registry.setdefault("klcc", registry["kuala lumpur"])
        registry.setdefault("kl city", registry["kuala lumpur"])
    for alias, canonical_key in [
        ("jb", "johor bahru"),
        ("johor", "johor bahru"),
        ("pg", "penang"),
        ("georgetown", "penang"),
        ("bukit jalil", "kuala lumpur"),
        ("bukitjalil", "kuala lumpur"),
        ("shah alam", "selangor"),
        ("pj", "petaling jaya"),
        ("petaling jaya", "petaling jaya"),
        ("ipoh", "ipoh"),
        ("nilai", "nilai"),
    ]:
        # Only register if the canonical city exists in catalogue
        target = registry.get(canonical_key)
        if target:
            registry.setdefault(alias, target)
        else:
            # Register against itself if city exists directly
            for key, city in list(registry.items()):
                if canonical_key in key:
                    registry.setdefault(alias, city)
                    break
    return registry


def resolve_city(value: Any) -> Optional[str]:
    """Resolve a free-text location into a known catalogue city.

    Returns the canonical city name from the catalogue, or None.
    """

    if value is None:
        return None

    normalized = normalize_city_key(value)
    if not normalized:
        return None

    registry = city_key_registry()
    direct = registry.get(normalized) or registry.get(normalized.replace(" ", ""))
    if direct:
        return direct

    # Embedded match (avoid ambiguity): handle phrases like "I'm in Kuala Lumpur".
    normalized_no_space = normalized.replace(" ", "")
    candidates: List[str] = []
    for key, canonical in registry.items():
        if len(key) < 3:
            continue
        if key in normalized or key in normalized_no_space:
            candidates.append(canonical)

    unique = sorted(set(candidates), key=str.lower)
    if len(unique) == 1:
        return unique[0]
    return None


def is_probable_location(value: Any) -> bool:
    text = normalize_free_text(value)
    if not text:
        return False

    words = re.findall(r"[A-Za-z]+", text)
    if not (1 <= len(words) <= 4):
        return False

    lowered = text.lower()
    disallowed = {
        "return",
        "refund",
        "exchange",
        "warranty",
        "broken",
        "complain",
        "help",
        "need",
        "want",
        "bought",
        "buy",
        "order",
        "tracking",
        "price",
        "cost",
        "appointment",
        "book",
    }
    return not any(token in lowered for token in disallowed)


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


PRODUCT_FIELD_ALIASES = {
    "productId": "product_id",
    "productName": "product_name",
    "productType": "product_type",
    "priceMyr": "price_myr",
    "frameMaterial": "frame_material",
    "frameShape": "frame_shape",
    "frameColor": "frame_color",
    "uvProtection": "uv_protection",
    "lensColor": "lens_color",
    "frameStyle": "frame_style",
    "lensType": "lens_type",
    "lensFeature": "lens_feature",
    "lensDuration": "lens_duration",
    "storeLocation": "store_location",
    "stockStatus": "stock_status",
    "newArrival": "new_arrival",
    "fallbackImageUrl": "fallback_image_url",
}


def normalize_product_record(product: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(product)
    for source_key, target_key in PRODUCT_FIELD_ALIASES.items():
        if target_key not in normalized and source_key in normalized:
            normalized[target_key] = normalized[source_key]
    return normalized


def load_catalogue() -> pd.DataFrame:
    """Load product catalogue from the remote DB-backed integration API."""
    if not gateway.enabled():
        raise RuntimeError(
            "BACKEND_API_BASE_URL is not set. Product catalogue is only available via the integration API (Postgres)."
        )
    remote_products: Any = gateway.list_products()
    if isinstance(remote_products, list) and remote_products:
        # Ensure we have a list of flat dictionaries before creating a DataFrame.
        if all(isinstance(p, dict) for p in remote_products):
            df = pd.DataFrame([normalize_product_record(p) for p in remote_products]).fillna("")
            if "price_myr" in df.columns:
                df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")
        else:
            raise RuntimeError("Remote product catalogue returned invalid product records.")
    else:
        raise RuntimeError(
            "Remote product catalogue unavailable. "
            "Set BACKEND_API_BASE_URL to the integration API and ensure it is using STORAGE_BACKEND=postgres."
        )

    # Normalize common string fields early so downstream filtering is stable.
    for col in ["brand", "product_name", "product_type", "category", "frame_material", "frame_shape", "frame_color"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    if "price_myr" in df.columns:
        df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")

    # Fix mixed/fake brands in the sample catalogue.
    # Frames/sunglasses product names follow: "<Brand> Premium Frame <n>" / "<Brand> Luxe Sunglasses <n>".
    if "product_name" in df.columns and "brand" in df.columns:
        extracted = df["product_name"].astype(str).str.extract(
            r"^(?P<brand>.+?)\s+(?:Premium Frame|Luxe Sunglasses)\s+\d+\s*$",
            flags=re.IGNORECASE,
        )
        extracted_brand = extracted["brand"].fillna("").astype(str).str.strip()
        mask = extracted_brand.astype(bool)
        if mask.any():
            df.loc[mask, "brand"] = extracted_brand[mask]

        # Normalize any concatenated brand strings and strip duplicate brand prefixes in names.
        def _clean_brand(value: str) -> str:
            parts = re.split(r"\s*[-/]\s*", value or "")
            return parts[0].strip() if parts else str(value or "").strip()

        def _clean_product_name(name: str, brand_value: str) -> str:
            cleaned = str(name or "").strip()
            if " - " in cleaned:
                segments = [seg.strip() for seg in cleaned.split(" - ") if seg.strip()]
                if len(segments) > 1:
                    cleaned = " ".join(segments[1:])
            if brand_value and cleaned.lower().startswith(brand_value.lower()):
                cleaned = cleaned[len(brand_value):].strip(" -")
            return cleaned or str(name or "").strip()

        df["brand"] = df["brand"].astype(str).apply(_clean_brand)
        df["product_name"] = [
            _clean_product_name(name, brand)
            for name, brand in zip(df["product_name"].tolist(), df["brand"].tolist())
        ]

    return df


def load_kb_metadata() -> List[Dict[str, Any]]:
    """Load knowledge chunks for FAQ routing from the remote DB via integration service."""
    if not gateway.enabled():
        raise RuntimeError(
            "BACKEND_API_BASE_URL is not set. Knowledge base is only available via the integration API (Postgres)."
        )
    remote: Any = gateway.get_json("/knowledge/chunks")
    if remote is None:
        raise RuntimeError(
            "Knowledge base unavailable from integration API. "
            "Ensure chatbot-integrations is running with STORAGE_BACKEND=postgres."
        )
    if not isinstance(remote, list):
        raise RuntimeError("Knowledge base API returned an unexpected response shape.")
    out: List[Dict[str, Any]] = []
    for item in remote:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        source = item.get("source")
        if isinstance(text, str) and text.strip() and isinstance(source, str):
            out.append({"source": source, "text": text})
    return out


def clean_faq_answer(text: str, requested_group: Optional[str] = None) -> str:
    answer = " ".join(str(text or "").split()).strip()
    if not answer:
        return ""

    question_patterns = {
        "refund": r"Q:\s*What is your refund or return policy\?\s*A:\s*",
        "warranty": r"Q\d*\.?\s*[^?]*warranty[^?]*\?\s*A:\s*",
        "booking": r"Q\d*\.?\s*[^?]*(?:book|appointment|eye test)[^?]*\?\s*A:\s*",
        "after_sales": r"Q\d*\.?\s*[^?]*(?:after-sales|after sales|support|adjustment)[^?]*\?\s*A:\s*",
        "stores": r"Q\d*\.?\s*[^?]*(?:stores located|store locator|location)[^?]*\?\s*A:\s*",
    }
    patterns = []
    if requested_group and requested_group in question_patterns:
        patterns.append(question_patterns[requested_group])
    patterns.append(r"Q\d*\.?\s*[^?]+\?\s*A:\s*")

    for pattern in patterns:
        matches = list(re.finditer(pattern, answer, flags=re.IGNORECASE))
        if matches:
            answer = answer[matches[-1].end():].strip()
            break

    next_question = re.search(r"\s+Q\d*\.?\s*[^?]+\?\s*A:\s*", answer, flags=re.IGNORECASE)
    if next_question:
        answer = answer[:next_question.start()].strip()

    return answer


def parse_budget_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Deterministically extract budget constraints from free text. Returns dict with
    budget_min and/or budget_max keys, or None if no budget found."""
    if not text:
        return None
    t = text.lower().replace("rm", "").replace(",", "").strip()
    result: Dict[str, Any] = {}

    if re.search(r"\b(cheap|cheapest|lowest|murah|jimat)\b", t):
        result["budget_bucket"] = "low"
    elif re.search(r"\b(affordable|budget)\b", t):
        result["budget_max"] = 300.0
    elif re.search(r"\b(premium|luxury|expensive|mewah|high.end)\b", t):
        result["budget_min"] = 700.0
        result["budget_bucket"] = "premium"

    m = re.search(r"(?:between|dari|antara)?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-|hingga|sampai)\s*(\d+(?:\.\d+)?)", t)
    if m:
        result["budget_min"] = float(m.group(1))
        result["budget_max"] = float(m.group(2))
        return result

    m = re.search(r"(?:under|below|less\s*than|bawah|kurang\s*dari|di\s*bawah|<)\s*(\d+(?:\.\d+)?)", t)
    if m:
        result["budget_max"] = float(m.group(1))
        return result

    m = re.search(r"(?:over|above|more\s*than|atas|lebih\s*dari|>)\s*(\d+(?:\.\d+)?)", t)
    if m:
        result["budget_min"] = float(m.group(1))
        return result

    m = re.search(r"(?:around|about|sekitar|kira.kira)\s*(\d+(?:\.\d+)?)", t)
    if m:
        center = float(m.group(1))
        delta = max(center * 0.2, 50.0)
        result["budget_min"] = max(center - delta, 0)
        result["budget_max"] = center + delta
        return result

    return result if result else None


def filter_by_budget(
    df: pd.DataFrame,
    budget_slot: Text,
    tracker: Optional[Tracker] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> pd.DataFrame:
    """Apply HARD budget filter. Budget constraints are applied BEFORE ranking."""
    if "price_myr" not in df.columns:
        return df

    b_min: Optional[float] = None
    b_max: Optional[float] = None
    b_bucket: Optional[str] = None

    # 1. Prefer explicit overrides (from pre-parsed query)
    if overrides:
        try:
            if overrides.get("budget_min") is not None:
                b_min = float(overrides.get("budget_min"))
        except (TypeError, ValueError):
            pass
        try:
            if overrides.get("budget_max") is not None:
                b_max = float(overrides.get("budget_max"))
        except (TypeError, ValueError):
            pass
        if overrides.get("budget_bucket"):
            b_bucket = str(overrides.get("budget_bucket"))

    # 2. Prefer explicit numeric slots (from integration layer opportunistic fill)
    if tracker and b_min is None and b_max is None and not b_bucket:
        raw_min = tracker.get_slot("budget_min")
        raw_max = tracker.get_slot("budget_max")
        raw_bucket = tracker.get_slot("budget_bucket")
        if raw_min is not None:
            try:
                b_min = float(raw_min)
            except (TypeError, ValueError):
                pass
        if raw_max is not None:
            try:
                b_max = float(raw_max)
            except (TypeError, ValueError):
                pass
        if raw_bucket:
            b_bucket = str(raw_bucket)

    # 3. Fall back to parsing the budget string slot
    if b_min is None and b_max is None and not b_bucket and budget_slot:
        budget_text = str(budget_slot).strip()
        budget_lower = budget_text.lower().replace(" ", "").replace("–", "-")
        if "underrm100" in budget_lower or "belowrm100" in budget_lower:
            b_max = 100.0
        elif "rm100-rm250" in budget_lower or "rm100rm250" in budget_lower:
            b_min, b_max = 100.0, 250.0
        elif "rm250-rm300" in budget_lower or "rm250rm300" in budget_lower:
            b_min, b_max = 250.0, 300.0
        elif "aboverm300" in budget_lower:
            b_min = 300.0
        else:
            parsed = parse_budget_from_text(budget_text)
            if parsed:
                b_min = parsed.get("budget_min")
                b_max = parsed.get("budget_max")
                b_bucket = parsed.get("budget_bucket")

    # 4. Also try parsing the raw message text if still no budget
    if b_min is None and b_max is None and not b_bucket and tracker:
        msg_text = tracker.latest_message.get("text") or ""
        parsed = parse_budget_from_text(msg_text)
        if parsed:
            b_min = parsed.get("budget_min")
            b_max = parsed.get("budget_max")
            b_bucket = parsed.get("budget_bucket")

    # Apply HARD filters
    filtered = df
    if b_min is not None or b_max is not None:
        if b_min is not None:
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] >= b_min]
        if b_max is not None:
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] <= b_max]
    else:
        if b_bucket == "low":
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] <= 150]
        elif b_bucket == "premium":
            filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
            filtered = filtered[filtered["price_myr"] >= 700]

    logger.info(
        "[BUDGET] min=%s max=%s bucket=%s → %d/%d products remain",
        b_min, b_max, b_bucket, len(filtered), len(df)
    )
    return filtered


def format_product(row: pd.Series) -> str:
    brand = row.get("brand") or "Unknown Brand"
    name = row.get("product_name") or "Unknown Product"
    price = row.get("price_myr")
    city = row.get("city") or ""
    store = row.get("store_location") or ""
    suffix = f"\nLocation: {store}, {city}".rstrip(", ")
    return f"{brand} - {name}\nPrice: RM{float(price):.2f}{suffix}"


def latest_entity_values(tracker: Tracker) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    for entity in tracker.latest_message.get("entities", []):
        entity_name = entity.get("entity")
        if entity_name:
            values[entity_name] = entity.get("value")
    return values


def canonical_text_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower()).strip()


CANONICAL_ALIASES: Dict[str, Dict[str, str]] = {
    "lens_type": {
        "single vision": "Single Vision Lenses",
        "single vision lens": "Single Vision Lenses",
        "single vision lenses": "Single Vision Lenses",
        "progressive": "Progressive Lenses",
        "progressive lens": "Progressive Lenses",
        "progressive lenses": "Progressive Lenses",
        "blue light": "Blue Light Protection",
        "blue light lens": "Blue Light Protection",
        "blue light lenses": "Blue Light Protection",
        "blue light protection": "Blue Light Protection",
        "photochromic": "Photochromic Lenses",
        "photochromic lens": "Photochromic Lenses",
        "photochromic lenses": "Photochromic Lenses",
    },
    "product_type": {
        "designer frame": "Frames",
        "designer frames": "Frames",
        "frames": "Frames",
        "frame": "Frames",
        "glasses": "Frames",
        "spectacles": "Frames",
        "eyeglasses": "Frames",
        "blue light glasses": "Frames",
        "office glasses": "Frames",
        "office wear glasses": "Frames",
        "work glasses": "Frames",
        "computer glasses": "Frames",
        "gaming glasses": "Frames",
        "luxury sunglasses": "Sunglasses",
        "sunglasses": "Sunglasses",
        "sunglass": "Sunglasses",
        "shades": "Sunglasses",
        "sun glasses": "Sunglasses",
        "cermin mata hitam": "Sunglasses",
        "太阳镜": "Sunglasses",
        "contact lenses": "Contact Lenses",
        "contact lens": "Contact Lenses",
        "contacts": "Contact Lenses",
        "kanta sentuh": "Contact Lenses",
        "隐形眼镜": "Contact Lenses",
    },
    "preferred_service": {
        "designer frame": "Designer Frames",
        "designer frames": "Designer Frames",
        "luxury sunglasses": "Luxury Sunglasses",
        "sunglasses": "Luxury Sunglasses",
        "lens": "Lens Consultation",
        "lens consultation": "Lens Consultation",
        "eyewear recommendation": "Eyewear Recommendation",
        "store visit": "Store Visit",
        "after sales support": "After-sales Support",
        "after sales": "After-sales Support",
        "appointment booking": "Appointment Booking",
        "appointment reschedule": "Appointment Reschedule",
        "consultant support": "Consultant Support",
        "order tracking": "Order Tracking",
    },
}


def canonicalize_slot_value(slot_name: str, value: Any) -> Any:
    if value in (None, ""):
        return value
    aliases = CANONICAL_ALIASES.get(slot_name)
    if not aliases:
        return value
    return aliases.get(canonical_text_key(value), value)


def canonicalize_entities(values: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: canonicalize_slot_value(key, value)
        for key, value in values.items()
    }


NORMALIZATION_MAP: Dict[str, str] = {
    "guci": "gucci",
    "rayban": "ray-ban",
    "sunglass": "sunglasses",
    "sun glass": "sunglasses",
    "contacts": "contact lenses",
    "contact lens": "contact lenses",
    "contct lens": "contact lenses",
    "kontak lens": "contact lenses",
    "bluelight": "blue light",
    "blue-light": "blue light",
    "cermin mata hitam": "sunglasses",
    "bingkai": "frames",
    "kanta sentuh": "contact lenses",
    "太阳镜": "sunglasses",
    "镜框": "frames",
    "隐形眼镜": "contact lenses",
}

BUDGET_KEYWORDS = re.compile(r"\b(under|below|max|budget|around|less\s*than|bawah|kurang\s*dari|di\s*bawah)\b", re.IGNORECASE)
CHEAP_KEYWORDS = re.compile(r"\b(cheap|affordable|budget|murah|bajet|cheapest|lowest)\b", re.IGNORECASE)
PREMIUM_KEYWORDS = re.compile(r"\b(premium|expensive|luxury|mewah|high.end)\b", re.IGNORECASE)
BEST_KEYWORDS = re.compile(r"\b(best|top rated|top-rated|highest rated)\b", re.IGNORECASE)
SUPPORT_KEYWORDS = {
    "return", "refund", "exchange", "repair", "warranty", "broken", 
    "damaged", "support", "scratched", "cracked", "cancel order", 
    "defective", "after sales", "after-sales", "order tracking", 
    "track order", "tracking", "complaint", "cancel", "wrong size", "different frame"
}

SUPPORT_INTENT_MAP = {
    "return_request": ["return", "send back"],
    "refund_request": ["refund", "reimbursement", "money back"],
    "exchange_request": ["exchange", "swap", "replace", "wrong size", "different frame"],
    "warranty_support": ["warranty", "claim warranty"],
    "repair_support": ["repair", "broken", "damaged", "scratched", "cracked", "defective", "fix", "loose frame", "bent"],
    "order_support": ["cancel order", "order tracking", "track order", "tracking", "delivery", "shipment", "order problem"],
    "after_sales_support": ["after sales", "after-sales", "support", "complaint", "help with my order"],
}

SUPPORT_INTENTS = set(SUPPORT_INTENT_MAP.keys()) | {
    "after_sales_support",
    "warranty_support",
    "order_tracking",
}

# ── CTA completion response variants ─────────────────────────────────────────
# Five distinct, premium-tone responses per CTA flow (English only).
# Malay / Chinese variants are handled inline via tr() where needed.

_RESPONSES_BOOK_VISIT = [
    "Your visit request is confirmed. We'll share the appointment details at the contact you've provided.",
    "All set. Our team will reach out shortly to confirm your appointment and everything you need to know.",
    "Your appointment has been requested. You'll receive a confirmation at the contact details you shared.",
    "Noted. Expect to hear from us soon with your visit confirmation and store details.",
    "Your visit is being arranged. We'll be in touch with all the details very soon.",
]

_RESPONSES_CONSULT_NOW = [
    "Noted. One of our advisors will be in touch with you shortly.",
    "Your consultation request is in. Our team will contact you at the details you've shared.",
    "Received. A Calisto advisor will reach out to you soon.",
    "All set. Expect a call or message from one of our specialists shortly.",
    "Our team has your details. An advisor will connect with you very soon.",
]

_RESPONSES_SUPPORT = [
    "Your support request has been logged. Our team will follow up with the next steps for your case.",
    "We've noted your request. A member of our support team will be in touch with you shortly.",
    "Your case is with us. Someone from our support team will reach out soon to assist.",
    "Received. Our team will review your request and connect with you shortly.",
    "Your request has been recorded. A support specialist will follow up with you soon.",
]

_RESPONSES_GENERAL = [
    "Your details are with us. Our team will be in touch soon.",
    "All noted. Expect to hear from our team shortly.",
    "We have everything we need. Someone from our team will follow up with you.",
    "Received. Our team will connect with you soon.",
    "Your details are noted. We'll be in touch to take things forward.",
]

_SUPPORT_SERVICE_NAMES = {
    "Return Request",
    "Refund Request",
    "Exchange Request",
    "Warranty Support",
    "Repair Support",
    "Order Tracking/Support",
    "Order Tracking",
    "After-sales Support",
}

_BOOK_VISIT_SERVICE_NAMES = {"Store Visit", "Appointment Booking", "Appointment Reschedule"}

_CONSULT_SERVICE_NAMES = {
    "Eyewear Recommendation",
    "Lens Consultation",
    "Designer Frames",
    "Luxury Sunglasses",
    "Consultant Support",
}


def _pick_completion_response(preferred_service: str, current_flow: str, latest_intent: str) -> str:
    """Return a contextual completion message based on the active CTA flow."""
    if current_flow == "support_flow" or preferred_service in _SUPPORT_SERVICE_NAMES:
        return random.choice(_RESPONSES_SUPPORT)
    if preferred_service in _BOOK_VISIT_SERVICE_NAMES or latest_intent == "book_appointment":
        return random.choice(_RESPONSES_BOOK_VISIT)
    if preferred_service in _CONSULT_SERVICE_NAMES or latest_intent in {"capture_lead", "human_handoff"}:
        return random.choice(_RESPONSES_CONSULT_NOW)
    return random.choice(_RESPONSES_GENERAL)

SHOPPING_INTENTS = {
    "browse_eyewear",
    "select_product_type",
    "select_brand",
    "select_budget",
    "ask_pricing",
    "select_pricing_category",
    "search_product",
    "search_product_by_attribute",
    "product_recommendation",
    "inform_budget",
}

LENS_INTENTS = {"ask_lens_type", "lens_vision_solutions"}

STORE_INTENTS = {"find_a_store", "store_hours", "choose_city"}

APPOINTMENT_INTENTS = {
    "capture_lead",
    "share_name",
    "share_phone",
    "share_email",
    "share_location",
    "share_service_interest",
    "share_timeline",
    "book_appointment",
    "reschedule_appointment",
    "human_handoff",
}

FLOW_DOMAIN_MAP = {
    "support_flow": "support",
    "product_search": "shopping",
    "browse_eyewear": "shopping",
    "pricing": "shopping",
    "product_recommendation": "shopping",
    "lens_consultation": "lens",
    "store_lookup": "store",
    "lead_capture": "appointment",
}

ALLOWED_CARRYOVER_SLOTS = {
    "brand",
    "product_type",
    "budget",
    "budget_min",
    "budget_max",
    "budget_bucket",
    "price_range",
}

USE_CASE_KEYWORDS: Dict[str, List[str]] = {
    "office": [
        "office",
        "office wear",
        "work",
        "corporate",
        "professional",
        "business",
        "desk work",
        "zoom meetings",
        "studying",
        "student",
        "pejabat",
        "办公",
        "工作",
    ],
    "screen": [
        "screen",
        "computer",
        "laptop",
        "blue light",
        "bluelight",
        "laptop use",
        "coding",
        "programmer",
        "developer",
        "gaming",
        "skrin",
        "屏幕",
        "电脑",
    ],
    "driving": ["driving", "drive", "memandu", "驾驶"],
    "fashion": ["fashion", "stylish", "trendy", "fesyen", "时尚"],
    "sports": ["sports", "sport", "active", "running", "cycling", "sukan", "运动", "跑步", "骑行"],
    "daily": ["daily", "everyday", "daily disposable", "daily contacts", "harian", "日常", "日抛", "日抛隐形眼镜"],
}


def _replace_term(text: str, term: str, replacement: str) -> str:
    if re.search(r"[A-Za-z0-9]", term):
        return re.sub(rf"\b{re.escape(term)}\b", replacement, text, flags=re.IGNORECASE)
    return text.replace(term, replacement)


def normalize_search_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "").strip().lower())
    for key, value in sorted(NORMALIZATION_MAP.items(), key=lambda kv: -len(kv[0])):
        normalized = _replace_term(normalized, key, value)
    return normalized.strip()


def detect_category_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    if any(token in text for token in ["sunglasses", "shades", "sun glasses", "cermin mata hitam", "太阳镜"]):
        return "Sunglasses"
    if any(token in text for token in ["contact lenses", "contact lens", "contacts", "kanta sentuh", "隐形眼镜"]):
        return "Contact Lenses"
    if any(token in text for token in ["frames", "frame", "glasses", "eyeglasses", "spectacles", "cermin mata", "镜框", "眼镜"]):
        return "Frames"
    return None


GENDER_KEYWORDS = {
    "Men": ["men", "mens", "male", "lelaki", "男"],
    "Women": ["women", "womens", "female", "perempuan", "wanita", "女"],
    "Unisex": ["unisex", "neutral", "男女通用"],
}

def detect_gender_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    normalized = text.lower()
    for gender, keywords in GENDER_KEYWORDS.items():
        if any(re.search(rf"\b{re.escape(k)}\b", normalized) for k in keywords):
            return gender
    return None


def category_group(value: Optional[str]) -> str:
    key = canonical_text_key(value)
    if not key:
        return ""
    if "contact" in key or "lens" in key or "隐形" in key:
        return "contacts"
    if "sunglass" in key or "太阳镜" in key:
        return "sunglasses"
    if "frame" in key or "glasses" in key or "spectacle" in key or "镜框" in key or "眼镜" in key:
        return "frames"
    return ""


def detect_use_case_from_text(text: str) -> Optional[str]:
    for use_case, keywords in USE_CASE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return use_case
    return None


def detect_support_intent(tracker) -> tuple[str, str, bool]:
    # Returns (intent_name, override_reason, keyword_match)
    # 1. Check intent confidence
    intent = tracker.latest_message.get("intent", {})
    intent_name = intent.get("name", "")
    confidence = intent.get("confidence", 0.0)
    
    support_intents = set(SUPPORT_INTENT_MAP.keys()) | {"after_sales_support", "warranty_support"}
    if confidence >= 0.7 and intent_name in support_intents:
        return (intent_name, "high_confidence_intent", False)

    # 2. Check keywords as firewall
    raw_text = tracker.latest_message.get("text") or ""
    if not raw_text or raw_text.startswith("/"):
        return ("", "", False)
    
    normalized = raw_text.lower()
    for sup_intent, keywords in SUPPORT_INTENT_MAP.items():
        if any(keyword in normalized for keyword in keywords):
            return (sup_intent, f"keyword_match_{sup_intent}", True)
            
    if any(keyword in normalized for keyword in SUPPORT_KEYWORDS):
        return ("after_sales_support", "keyword_match_generic_support", True)
        
    return ("", "", False)


def get_active_loop_name(tracker: Tracker) -> str:
    active_loop = tracker.active_loop
    if isinstance(active_loop, dict):
        return str(active_loop.get("name") or "").strip()
    if isinstance(active_loop, str):
        return active_loop.strip()
    return ""


def get_previous_intent(tracker: Tracker) -> str:
    seen_latest = False
    for event in reversed(tracker.events):
        if event.get("event") != "user":
            continue
        if not seen_latest:
            seen_latest = True
            continue
        intent_data = event.get("parse_data", {}).get("intent", {})
        name = str(intent_data.get("name") or "").strip()
        if name:
            return name
    return ""


def resolve_domain_from_intent(intent_name: str) -> str:
    if intent_name in SUPPORT_INTENTS:
        return "support"
    if intent_name in SHOPPING_INTENTS:
        return "shopping"
    if intent_name in LENS_INTENTS:
        return "lens"
    if intent_name in STORE_INTENTS:
        return "store"
    if intent_name in APPOINTMENT_INTENTS:
        return "appointment"
    return ""


def resolve_new_domain(tracker: Tracker, intent_name: str, raw_text: str, support_intent: str) -> str:
    if support_intent:
        return "support"
    domain = resolve_domain_from_intent(intent_name)
    if domain:
        return domain
    if raw_text:
        brand_lookup = build_brand_lookup(load_catalogue())
        if looks_like_product_query(raw_text, brand_lookup):
            return "shopping"
    return ""


def detect_domain_switch(
    tracker: Tracker,
    intent_name: str,
    raw_text: str,
    support_intent: str,
) -> Dict[str, Any]:
    current_flow = str(tracker.get_slot("current_flow") or "").strip()
    previous_domain = FLOW_DOMAIN_MAP.get(current_flow, "")
    if not previous_domain:
        active_loop_name = get_active_loop_name(tracker)
        if active_loop_name == "lead_capture_form":
            previous_domain = "appointment"

    new_domain = resolve_new_domain(tracker, intent_name, raw_text, support_intent)
    previous_intent = get_previous_intent(tracker)
    detected = bool(previous_domain and new_domain and previous_domain != new_domain)

    return {
        "previous_intent": previous_intent,
        "previous_domain": previous_domain,
        "new_intent": intent_name,
        "new_domain": new_domain,
        "detected": detected,
    }


def reset_conversation_state(tracker: Tracker) -> tuple[List[Dict[Text, Any]], List[str], bool]:
    cleared_slots: List[str] = []
    events: List[Dict[Text, Any]] = []
    active_loop_name = get_active_loop_name(tracker)

    if active_loop_name:
        events.append(ActiveLoop(None))

    if tracker.get_slot("requested_slot") is not None:
        events.append(SlotSet("requested_slot", None))
        cleared_slots.append("requested_slot")

    if tracker.get_slot("current_flow") is not None:
        events.append(SlotSet("current_flow", None))
        cleared_slots.append("current_flow")

    for slot_name in sorted(MANAGED_SLOTS):
        if slot_name in ALLOWED_CARRYOVER_SLOTS:
            continue
        if tracker.get_slot(slot_name) is not None:
            events.append(SlotSet(slot_name, None))
            cleared_slots.append(slot_name)

    return events, cleared_slots, bool(active_loop_name)


def apply_domain_switch_reset(
    tracker: Tracker,
    intent_name: str,
    raw_text: str,
    support_intent: str,
) -> List[Dict[Text, Any]]:
    switch = detect_domain_switch(tracker, intent_name, raw_text, support_intent)
    if not switch["detected"]:
        return []

    reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
    logger.info({
        "previous_intent": switch["previous_intent"],
        "new_intent": switch["new_intent"],
        "domain_switch_detected": True,
        "cleared_active_loop": cleared_active_loop,
        "cleared_slots": cleared_slots,
    })
    return reset_events


def route_support_flow(
    dispatcher: CollectingDispatcher,
    tracker: Tracker,
    intent_name: str,
) -> List[Dict[Text, Any]]:
    
    service_map = {
        "return_request": "Return Request",
        "refund_request": "Refund Request",
        "exchange_request": "Exchange Request",
        "warranty_support": "Warranty Support",
        "warranty_support": "Warranty Support",
        "repair_support": "Repair Support",
        "order_support": "Order Tracking/Support",
        "order_tracking": "Order Tracking/Support"
    }
    preferred_service = service_map.get(intent_name, "After-sales Support")

    # Output relevant policy context if applicable
    keyword_map = {
        "return_request": "refund",
        "refund_request": "refund",
        "exchange_request": "refund",
        "warranty_support": "warranty",
        "repair_support": "warranty"
    }
    search_group = keyword_map.get(intent_name)
    
    if search_group:
        try:
            faq_entries = load_kb_metadata()
            best_result = None
            for entry in faq_entries:
                text = str(entry.get("text") or "").strip().lower()
                if search_group == "refund" and ("refund or return policy" in text or "refund" in text):
                    best_result = entry
                    break
                elif search_group == "warranty" and "warranty" in text:
                    best_result = entry
                    break
                    
            if best_result:
                answer = best_result.get("text", "").strip()
                if " A:" in answer:
                    answer = answer.split(" A:", 1)[1].strip()
                if " Q:" in answer:
                    answer = answer.split(" Q:", 1)[0].strip()
                dispatcher.utter_message(text=f"📄 {answer}")
        except Exception as e:
            logger.error(f"Failed to fetch policy before escalation: {e}")

    _support_intros = [
        f"Of course. I'll connect you with our support team for your {preferred_service.lower()} right away.",
        f"Understood. Let me get our support team on your {preferred_service.lower()}.",
        f"No problem. I'm routing your {preferred_service.lower()} to the right team now.",
        f"Got it. Our support team will take care of your {preferred_service.lower()} from here.",
        f"Noted. I'm passing your {preferred_service.lower()} to a specialist who can assist you.",
    ]
    dispatcher.utter_message(text=random.choice(_support_intros))

    events = ActionPrefillLeadCapture().run(dispatcher, tracker, {})
    
    # Always reset product search context entirely as per requirements
    clearable = set(MANAGED_SLOTS) - set(PERSISTENT_SLOTS)
    for slot_name in clearable:
        if tracker.get_slot(slot_name) is not None:
            events.append(SlotSet(slot_name, None))
            
    events.append(SlotSet("preferred_service", preferred_service))
    events.append(SlotSet("current_flow", "support_flow"))
    events.append(FollowupAction("lead_capture_form"))
    return events


def match_attribute_from_text(text: str, values: List[str]) -> Optional[str]:
    if not text:
        return None
    text_key = canonical_text_key(text)
    for value in values:
        key = canonical_text_key(value)
        if key and key in text_key:
            return value
    return None


def build_brand_lookup(df: pd.DataFrame) -> Dict[str, str]:
    brands = {
        canonical_text_key(brand): str(brand).strip()
        for brand in df.get("brand", pd.Series(dtype=str)).tolist()
        if str(brand).strip()
    }
    return {key: value for key, value in brands.items() if key}


def detect_brand_from_text(text: str, brand_lookup: Dict[str, str]) -> Optional[str]:
    if not text or not brand_lookup:
        return None
    text_key = canonical_text_key(text)
    for key, brand in brand_lookup.items():
        if key and key in text_key:
            return brand
    tokens = [token for token in text_key.split() if len(token) > 2]
    if not tokens:
        return None
    matches = get_close_matches(" ".join(tokens), brand_lookup.keys(), n=1, cutoff=0.85)
    if matches:
        return brand_lookup.get(matches[0])
    for token in tokens:
        matches = get_close_matches(token, brand_lookup.keys(), n=1, cutoff=0.85)
        if matches:
            return brand_lookup.get(matches[0])
    return None


def looks_like_product_query(text: str, brand_lookup: Optional[Dict[str, str]] = None) -> bool:
    normalized = normalize_search_text(text)
    if detect_category_from_text(normalized):
        return True
    if BUDGET_KEYWORDS.search(normalized) or parse_budget_from_text(normalized):
        return True
    if brand_lookup and detect_brand_from_text(normalized, brand_lookup):
        return True
    if any(token in normalized for token in ["frame", "sunglasses", "contact lenses", "glasses", "shades"]):
        return True
    return False


def format_product_list(rows: pd.DataFrame, heading: str) -> str:
    lines = [heading, ""]
    for index, (_, row) in enumerate(rows.iterrows(), start=1):
        brand = titleize(row.get("brand")) or "Calisto"
        product_name = str(row.get("product_name") or "Frame").strip()
        location_parts = [str(row.get("store_location") or "").strip(), str(row.get("city") or "").strip()]
        location = ", ".join(part for part in location_parts if part)
        lines.append(f"{index}. {brand} - {product_name}")
        lines.append(f"Price: RM{float(row.get('price_myr', 0) or 0):.2f}")
        if location:
            lines.append(f"Location: {location}")
        lines.append("")
    return "\n".join(lines).strip()


def rank_products_safely(
    df: pd.DataFrame,
    product_type: Any = None,
    brand: Any = None,
    use_case: Any = None,
) -> pd.DataFrame:
    try:
        ranked = df.copy()
        if ranked.empty:
            return ranked

        score = pd.Series(0.0, index=ranked.index)
        if product_type:
            product_type_text = str(product_type)
            score += ranked["product_type"].astype(str).str.contains(product_type_text, case=False, na=False).astype(float) * 4
            score += ranked["category"].astype(str).str.contains(product_type_text, case=False, na=False).astype(float) * 2
        if brand:
            score += ranked["brand"].astype(str).str.contains(str(brand), case=False, na=False).astype(float) * 3
        if use_case:
            use_case_text = str(use_case)
            relevance = (
                ranked["description"].astype(str).str.contains(use_case_text, case=False, na=False)
                | ranked["product_name"].astype(str).str.contains(use_case_text, case=False, na=False)
                | ranked["lens_feature"].astype(str).str.contains(use_case_text, case=False, na=False)
            )
            score += relevance.astype(float) * 2
        if "stock_status" in ranked.columns:
            stock = ranked["stock_status"].astype(str).str.lower()
            score += stock.eq("in_stock").astype(float) * 2
            score += stock.eq("low_stock").astype(float)
        if "rating" in ranked.columns:
            rating = pd.to_numeric(ranked["rating"], errors="coerce").fillna(0)
            score += rating / 5

        ranked = ranked.assign(_score=score)
        sort_columns = ["_score"]
        ascending = [False]
        if "price_myr" in ranked.columns:
            sort_columns.append("price_myr")
            ascending.append(True)
        return ranked.sort_values(sort_columns, ascending=ascending).drop(columns=["_score"], errors="ignore")
    except Exception as exc:
        logger.warning("Product ranking failed, falling back to catalogue order: %s", exc)
        return df


def unique_cities(df: pd.DataFrame) -> List[str]:
    cities = [str(city).strip() for city in df["city"].tolist() if str(city).strip()]
    return sorted(set(cities), key=str.lower)


def search_store_rows(df: pd.DataFrame, city: str) -> pd.DataFrame:
    return df[df["city"].astype(str).str.contains(city, case=False, na=False)][
        ["store_location", "city"]
    ].drop_duplicates()


def titleize(value: Optional[str]) -> str:
    return str(value or "").strip().title()


def build_maps_url(*parts: Any) -> str:
    query = ", ".join(str(part).strip() for part in parts if str(part).strip())
    return f"https://maps.google.com/?q={urllib.parse.quote(query)}"


def build_placeholder_image(label: str, theme: str = "eyewear") -> str:
    image_base_url = os.getenv("PLACEHOLDER_IMAGE_BASE_URL", "https://dummyimage.com").rstrip("/")
    themes = {
        "eyewear": {
            "bg": "1f2937",
            "fg": "f9fafb",
            "prefix": "CALISTO EYEWEAR",
        },
        "designer_frames": {
            "bg": "312e81",
            "fg": "eef2ff",
            "prefix": "DESIGNER FRAMES",
        },
        "sunglasses": {
            "bg": "7c2d12",
            "fg": "fffbeb",
            "prefix": "LUXURY SUNGLASSES",
        },
        "contact_lenses": {
            "bg": "075985",
            "fg": "ecfeff",
            "prefix": "CONTACT LENSES",
        },
        "store": {
            "bg": "0f766e",
            "fg": "f0fdfa",
            "prefix": "VISIT A STORE",
        },
        "lens": {
            "bg": "1d4ed8",
            "fg": "eff6ff",
            "prefix": "LENS SOLUTIONS",
        },
        "appointment": {
            "bg": "c2410c",
            "fg": "fff7ed",
            "prefix": "BOOK A VISIT",
        },
    }
    config = themes.get(theme, themes["eyewear"])
    safe_label = urllib.parse.quote((label[:30] or "Calisto Eyewear").upper())
    prefix = urllib.parse.quote(config["prefix"])
    return (
        f"{image_base_url}/1200x628/{config['bg']}/{config['fg']}"
        f"&text={prefix}%0A%0A{safe_label}"
    )

def choose_product_image_theme(product_type: str, preferred_service: Optional[str]) -> str:
    product_type_lower = str(product_type or "").lower()
    preferred_service_lower = str(preferred_service or "").lower()

    if "contact" in product_type_lower:
        return "contact_lenses"
    if "sunglass" in product_type_lower:
        return "sunglasses"
    if "designer" in product_type_lower or "frame" in product_type_lower:
        return "designer_frames"
    if "appointment" in preferred_service_lower or "visit" in preferred_service_lower:
        return "appointment"
    if "lens" in product_type_lower or "lens" in preferred_service_lower:
        return "lens"
    return "eyewear"


def lead_buttons(lang: str, preferred_service: Optional[str] = None) -> List[Dict[str, str]]:
    payload = '/capture_lead'
    if preferred_service:
        safe_service = str(preferred_service).replace('"', '\\"')
        payload = f'/capture_lead{{"preferred_service":"{safe_service}"}}'
    return [
        {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
        {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
        {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": payload},
    ]


def stylist_recommendation(product: Dict[str, Any], lang: str = "en") -> str:
    product_type = str(product.get("product_type") or product.get("category") or "").strip()
    material = titleize(product.get("frame_material"))
    shape = titleize(product.get("frame_shape"))
    lens_feature = str(product.get("lens_feature") or "").strip()

    if "contact" in product_type.lower():
        duration = str(product.get("lens_duration") or "").strip()
        if duration:
            return tr(
                lang,
                f"This contact lens is a practical pick for {duration.lower()} comfort and easy daily wear.",
                f"Kanta sentuh ini sesuai untuk keselesaan {duration.lower()} dan pemakaian harian yang mudah.",
                f"这款隐形眼镜适合 {duration.lower()} 佩戴需求，兼顾舒适与日常便利。",
            )
        return tr(
            lang,
            "This contact lens is a reliable option for clear, comfortable daily wear.",
            "Kanta sentuh ini ialah pilihan yang boleh dipercayai untuk pemakaian harian yang jelas dan selesa.",
            "这款隐形眼镜适合追求清晰视野与日常舒适佩戴的人群。",
        )

    if "sunglass" in product_type.lower():
        if shape and material:
            return tr(
                lang,
                f"This {material.lower()} {shape.lower()} sunglass works well for polished outdoor wear.",
                f"Cermin mata hitam {shape.lower()} daripada {material.lower()} ini sesuai untuk gaya luaran yang kemas.",
                f"这款 {material.lower()} {shape.lower()} 太阳镜很适合利落的户外造型。",
            )
        return tr(
            lang,
            "This sunglass is a strong option for elevated outdoor styling and comfortable sun coverage.",
            "Cermin mata hitam ini sesuai untuk gaya luaran yang lebih premium dan perlindungan cahaya matahari yang selesa.",
            "这款太阳镜兼顾高级户外造型与舒适遮阳表现。",
        )

    if lens_feature:
        return tr(
            lang,
            f"This frame is ideal if you want everyday comfort with {lens_feature.lower()} support.",
            f"Bingkai ini sesuai jika anda mahukan keselesaan harian dengan sokongan {lens_feature.lower()}.",
            f"这款镜框适合需要日常舒适感并搭配 {lens_feature.lower()} 功能的人群。",
        )
    if material and shape:
        return tr(
            lang,
            f"This {material.lower()} {shape.lower()} frame is ideal for lightweight all-day wear.",
            f"Bingkai {shape.lower()} daripada {material.lower()} ini sesuai untuk pemakaian ringan sepanjang hari.",
            f"这款 {material.lower()} {shape.lower()} 镜框适合轻盈的全天佩戴。",
        )
    if shape:
        return tr(
            lang,
            f"This {shape.lower()} frame is a versatile choice for refined daily wear.",
            f"Bingkai {shape.lower()} ini ialah pilihan serba boleh untuk gaya harian yang kemas.",
            f"这款 {shape.lower()} 镜框适合精致的日常佩戴风格。",
        )
    return tr(
        lang,
        "This style is a balanced choice for comfortable day-to-day wear.",
        "Gaya ini ialah pilihan seimbang untuk pemakaian harian yang selesa.",
        "这款式是兼顾舒适与日常搭配的稳妥选择。",
    )


def emit_product_card(dispatcher: CollectingDispatcher, product: Dict[str, Any], preferred_service: Optional[str], lang: str = "en") -> None:
    brand = str(product.get("brand") or "Brand").strip()
    name = str(product.get("product_name") or "Product").strip()
    if brand and name.lower().startswith(brand.lower()):
        name = name[len(brand):].strip(" -") or name
    price = float(product.get("price_myr", 0) or 0)
    product_type = str(product.get("product_type") or product.get("category") or "").strip()
    
    raw_gender = str(product.get("gender") or product.get("target_gender") or product.get("audience") or "").strip().lower()
    if any(k in raw_gender for k in ["women", "female", "girls", "womens"]):
        gender = "Women"
    elif any(k in raw_gender for k in ["men", "male", "boys", "mens"]):
        gender = "Men"
    elif "unisex" in raw_gender:
        gender = "Unisex"
    else:
        gender = ""
        
    material = titleize(product.get("frame_material"))
    shape = titleize(product.get("frame_shape"))
    color = titleize(product.get("frame_color"))
    stock = str(product.get("stock_status") or "").replace("_", " ").title()
    rating = product.get("rating")
    store_location = str(product.get("store_location") or "").strip()
    city = str(product.get("city") or "").strip()
    detail_parts = [part for part in [f"Brand: {brand}", gender, material, shape, color] if part]
    stylist_note = stylist_recommendation(product, lang)
    subtitle_sections = [
        tr(lang, f"Price: RM{price:.2f}", f"Harga: RM{price:.2f}", f"价格：RM{price:.2f}"),
        tr(lang, f"Category: {product_type}", f"Kategori: {product_type}", f"类别：{product_type}") if product_type else "",
        tr(lang, f"Specs: {' • '.join(detail_parts)}", f"Spesifikasi: {' • '.join(detail_parts)}", f"规格：{' • '.join(detail_parts)}") if detail_parts else "",
        tr(lang, f"Availability: {stock}", f"Ketersediaan: {stock}", f"库存：{stock}") if stock else "",
        tr(lang, f"Rating: {rating}/5", f"Penilaian: {rating}/5", f"评分：{rating}/5") if rating not in (None, "") else "",
        tr(lang, f"Stylist note: {stylist_note}", f"Cadangan stylist: {stylist_note}", f"造型建议：{stylist_note}") if stylist_note else "",
        tr(lang, f"Store: {store_location}, {city}".strip(", "), f"Kedai: {store_location}, {city}".strip(", "), f"门店：{store_location}, {city}".strip(", ")) if (store_location or city) else "",
    ]

    theme = choose_product_image_theme(product_type, preferred_service)
    raw_image = product.get("imageUrl") or product.get("image_url")
    fallback_image = (
        product.get("fallback_image_url")
        or product.get("fallbackImageUrl")
        or product.get("fallback_url")
        or product.get("fallbackUrl")
    )
    image_url = (
        _resolve_card_image_url(raw_image)
        or _resolve_card_image_url(fallback_image)
        or build_placeholder_image(f"{brand} {name}", theme)
    )

    actions = []
    actions.append({
        "type": "url",
        "title": tr(lang, "Open Product Link", "Buka Pautan Produk", "打开产品链接"),
        "value": "https://www.lenskart.com/vincent-chase-vc-s11748-c8-sunglasses.html",
    })

    actions.append({"type": "postback", "title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "value": "/book_appointment"})
    actions.append({
        "type": "postback",
        "title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"),
        "value": lead_buttons(lang, preferred_service)[-1]["payload"],
    })

    dispatcher.utter_message(
        json_message={
            "type": "card",
            "title": f"{brand} - {name}",
            "subtitle": "\n".join(line for line in subtitle_sections if line),
            "imageUrl": image_url,
            "actions": actions,
        }
    )


def _resolve_card_image_url(raw: Any) -> Optional[str]:
    """Absolutise a relative imageUrl (e.g. /static/products/abc.jpg) using
    PUBLIC_BASE_URL so channels (Telegram/WhatsApp/Messenger) can fetch it
    from the public internet. Already-absolute URLs are returned untouched.
    Empty/missing values return None so the caller can fall back to the
    placeholder image."""
    if raw is None:
        return None
    try:
        if pd.isna(raw):
            return None
    except (TypeError, ValueError):
        pass
    value = str(raw).strip()
    if not value or value.lower() in {"none", "null", "nan"}:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        return value
    base = (os.getenv("PUBLIC_BASE_URL") or "http://localhost:3000").rstrip("/")
    suffix = value if value.startswith("/") else f"/{value}"
    return f"{base}{suffix}"


def emit_store_card(dispatcher: CollectingDispatcher, store_location: str, city: str, lang: str = "en") -> None:
    dispatcher.utter_message(
        json_message={
            "type": "card",
            "title": store_location or "Calisto Store",
            "subtitle": "\n".join([
                tr(lang, f"City: {city}", f"Bandar: {city}", f"城市：{city}") if city else "",
                tr(lang, "Get directions or continue to book a visit.", "Dapatkan arah atau teruskan untuk tempah lawatan.", "获取路线或继续预约到店。"),
            ]).strip(),
            "imageUrl": build_placeholder_image(f"{store_location or 'Calisto Store'} {city}", "store"),
            "actions": [
                {
                    "type": "url",
                    "title": tr(lang, "Map", "Peta", "地图"),
                    "value": build_maps_url(store_location, city, "Calisto Eyewear"),
                },
                {
                    "type": "postback",
                    "title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"),
                    "value": '/capture_lead{"preferred_service":"Store Visit"}',
                },
            ],
        }
    )


def latest_metadata(tracker: Tracker) -> Dict[str, Any]:
    latest_message = tracker.latest_message if isinstance(tracker.latest_message, dict) else {}
    metadata = latest_message.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def infer_service_from_intent(tracker: Tracker) -> str:
    intent_name = str(tracker.latest_message.get("intent", {}).get("name") or "").strip()
    service_map = {
        "book_appointment": "Appointment Booking",
        "reschedule_appointment": "Appointment Reschedule",
        "after_sales_support": "After-sales Support",
        "order_tracking": "Order Tracking",
        "warranty_support": "Warranty Support",
        "human_handoff": "Consultant Support",
    }
    if intent_name in service_map:
        return service_map[intent_name]
    return ""


def infer_product_type_from_use_case(use_case: str) -> str:
    lowered = str(use_case or "").lower()
    if any(token in lowered for token in ["screen", "computer", "office", "work", "skrin", "pejabat", "办公", "屏幕"]):
        return "Designer Frames"
    if any(token in lowered for token in ["drive", "driving", "sun", "outdoor", "travel", "memandu", "luar", "驾驶", "户外", "出行"]):
        return "Luxury Sunglasses"
    if any(token in lowered for token in ["daily", "everyday", "contact", "comfort", "harian", "setiap hari", "日常", "隐形"]):
        return "Contact Lenses"
    if any(token in lowered for token in ["sport", "active", "running", "cycling", "sukan", "aktif", "运动", "跑步", "骑行"]):
        return "Luxury Sunglasses"
    if any(token in lowered for token in ["fashion", "stylish", "premium", "formal", "fesyen", "bergaya", "时尚", "正式"]):
        return "Designer Frames"
    return ""


def get_latest_intent(tracker: Tracker) -> Dict[str, Any]:
    intent_data = tracker.latest_message.get("intent") or {}
    intent_name = str(intent_data.get("name") or "").strip()
    confidence = float(intent_data.get("confidence") or 0.0)
    return {"name": intent_name, "confidence": confidence}


def normalize_free_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def strip_common_prefixes(value: str) -> str:
    return re.sub(
        r"^(?:my name is|i am|i'm|this is|name is)\s+",
        "",
        value,
        flags=re.IGNORECASE,
    ).strip(" .,-")


def is_refusal(text: str) -> bool:
    normalized = normalize_free_text(text).lower()
    refusal_patterns = [
        r"\bi do not want to\b",
        r"\bi don't want to\b",
        r"\bprefer not to\b",
        r"\bnot comfortable\b",
        r"\bwon't share\b",
        r"\bcannot share\b",
        r"\bdon't have\b",
        r"\bno phone\b",
        r"\bno email\b",
        r"\btak nak\b",
        r"\btidak mahu\b",
        r"\btak mahu\b",
    ]
    return any(re.search(pattern, normalized) for pattern in refusal_patterns)


def is_valid_name(value: str) -> bool:
    normalized = strip_common_prefixes(normalize_free_text(value))
    if len(normalized) < 2 or len(normalized) > 60:
        return False
    if is_refusal(normalized) or "@" in normalized or re.search(r"\d", normalized):
        return False
    if re.search(r"[?!]", normalized):
        return False
    disallowed_keywords = {
        "glasses",
        "frames",
        "sunglasses",
        "lenses",
        "price",
        "pricing",
        "gucci",
        "rayban",
        "store",
        "appointment",
    }
    lowered_tokens = set(re.findall(r"[a-zA-Z]+", normalized.lower()))
    if lowered_tokens & disallowed_keywords:
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z .'\-]{1,59}", normalized))


def normalize_name(value: str) -> str:
    return strip_common_prefixes(normalize_free_text(value))


def is_valid_phone(value: str) -> bool:
    digits = re.sub(r"[^\d+]", "", str(value or ""))
    digit_count = len(re.sub(r"\D", "", digits))
    return not is_refusal(str(value)) and 8 <= digit_count <= 15


def normalize_phone(value: str) -> str:
    return re.sub(r"[^\d+]", "", str(value or ""))


def is_valid_email(value: str) -> bool:
    normalized = normalize_free_text(value)
    return not is_refusal(normalized) and bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized))


def normalize_email(value: str) -> str:
    return normalize_free_text(value).lower()


def is_valid_location(value: str) -> bool:
    normalized = normalize_free_text(value)
    if len(normalized) < 2 or len(normalized) > 80:
        return False
    if is_refusal(normalized) or "@" in normalized:
        return False
    if re.search(r"\b\d{5,}\b", normalized):
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9 .,'/\-]{2,80}", normalized))


def is_valid_service(value: str) -> bool:
    normalized = normalize_free_text(value)
    if len(normalized) < 3 or len(normalized) > 80:
        return False
    if is_refusal(normalized):
        return False
    return not is_valid_email(normalized) and not is_valid_phone(normalized)


def normalize_timeline(value: str) -> Optional[str]:
    normalized = normalize_free_text(value).lower()
    allowed = {
        "this week": "This Week",
        "within 2 weeks": "Within 2 Weeks",
        "within two weeks": "Within 2 Weeks",
        "两周内": "Within 2 Weeks",
        "just exploring": "Just Exploring",
    }
    if normalized in allowed:
        return allowed[normalized]
    if "this week" in normalized:
        return "This Week"
    if "2 week" in normalized or "two week" in normalized:
        return "Within 2 Weeks"
    if "两周" in normalized:
        return "Within 2 Weeks"
    if any(token in normalized for token in ["exploring", "looking around", "just checking", "surveying"]):
        return "Just Exploring"
    return None


def detect_language_from_text(text: str) -> str:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return ""

    # Button payloads like `/browse_eyewear` or `/share_service_interest{...}`
    # are internal control messages, not user language signals.
    if normalized.startswith("/"):
        return ""

    if re.search(r"[\u3400-\u9FFF]", normalized):
        return "zh"

    english_keywords = [
        "hello",
        "hi",
        "help",
        "price",
        "store",
        "appointment",
        "warranty",
        "order",
        "recommend",
        "browse",
        "frames",
        "lenses",
    ]
    malay_keywords = [
        "saya",
        "nak",
        "mahu",
        "ingin",
        "boleh",
        "lihat",
        "cari",
        "produk",
        "harga",
        "kedai",
        "cawangan",
        "waranti",
        "tempah",
        "janji temu",
        "berdekatan",
        "tolong",
        "bantuan",
        "semak",
        "pesanan",
        "emel",
        "nombor",
        "laraskan",
        "penghantaran",
    ]
    if any(keyword in normalized for keyword in malay_keywords):
        return "ms"

    if any(keyword in normalized for keyword in english_keywords):
        return "en"

    if len(normalized) <= 3:
        return ""

    return "en"


def get_language(tracker: Tracker) -> str:
    slot_language = str(tracker.get_slot("preferred_language") or "").strip().lower()
    if slot_language in {"en", "ms", "zh"}:
        return slot_language

    return detect_language_from_text(tracker.latest_message.get("text") or "")


def tr(lang: str, en: str, ms: str, zh: str) -> str:
    if lang == "ms":
        return ms
    if lang == "zh":
        return zh
    return en


class ActionSetLanguage(Action):
    def name(self) -> Text:
        return "action_set_language"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        current = str(tracker.get_slot("preferred_language") or "").strip().lower()
        detected = detect_language_from_text(tracker.latest_message.get("text") or "")
        language = detected or (current if current in {"en", "ms", "zh"} else "en")
        return [SlotSet("preferred_language", language)]


class ActionDefaultFallback(Action):
    def name(self) -> Text:
        return "action_default_fallback"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        intent = get_latest_intent(tracker)
        intent_name = intent["name"]
        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            intent = get_latest_intent(tracker)
            switch = detect_domain_switch(tracker, intent["name"], raw_text, support_intent)
            reset_events: List[Dict[Text, Any]] = []
            if switch["detected"]:
                reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
                logger.info({
                    "previous_intent": switch["previous_intent"],
                    "new_intent": switch["new_intent"],
                    "domain_switch_detected": True,
                    "cleared_active_loop": cleared_active_loop,
                    "cleared_slots": cleared_slots,
                })
            logger.info({
                "intent": "action_default_fallback",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]
        brand_lookup = build_brand_lookup(load_catalogue())
        if looks_like_product_query(raw_text, brand_lookup):
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        consecutive_fallbacks = 0
        for event in reversed(tracker.events):
            if event.get("event") == "user":
                continue
            if event.get("event") == "action":
                if event.get("name") == "action_default_fallback":
                    consecutive_fallbacks += 1
                elif event.get("name") not in {"action_listen", "action_set_language"}:
                    break

        lang = get_language(tracker)
        if consecutive_fallbacks >= 1:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Here are some options to help you move forward:",
                    "Berikut adalah beberapa pilihan untuk membantu anda:",
                    "这里有一些选项可以帮助您："
                ),
                buttons=[
                    {"title": tr(lang, "Browse Products", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                    {"title": tr(lang, "Pricing", "Harga", "查看价格"), "payload": "/ask_pricing"},
                    {"title": tr(lang, "Stores", "Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Support", "Sokongan", "售后支持"), "payload": "/after_sales_support"},
                ],
            )
            return []

        dispatcher.utter_message(
            text=tr(
                lang,
                "I am not sure what you mean. I can help with products, pricing, stores, appointments, or support.",
                "Saya tidak pasti maksud anda. Saya boleh bantu dengan produk, harga, kedai, janji temu, atau sokongan.",
                "我不确定您的意思。我可以协助产品、价格、门店、预约或售后支持。"
            ),
            buttons=[
                {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                {"title": tr(lang, "Check Pricing", "Semak Harga", "查看价格"), "payload": "/ask_pricing"},
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
            ],
        )
        return []


class ActionGreetOrSearch(Action):
    def name(self) -> Text:
        return "action_greet_or_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        intent_name = intent.get("name") if intent else ""

        # Check if the user typed a free-text message (not a payload)
        is_free_text_query = not raw_text.startswith("/")

        # If it's a free text query for products, show results directly
        if is_free_text_query and intent_name in {"search_product", "browse_eyewear", "select_product_type", "greet"}:
            product_type = tracker.get_slot("product_type") or detect_category_from_text(raw_text)

            # If they just said "hi", don't force a product search, let the regular greeting happen
            if not product_type and intent_name == "greet":
                pass
            # If they asked for a product (even without a specific intent matched), show it
            elif product_type or intent_name in {"search_product", "browse_eyewear", "select_product_type"}:
                slots_to_set = [
                    SlotSet("product_type", product_type or "Frames"),
                    SlotSet("brand", "all"),
                    SlotSet("price_range", None),
                    SlotSet("budget", None),
                    SlotSet("budget_min", None),
                    SlotSet("budget_max", None)
                ]

                logger.info("Free-text product query detected in ActionGreetOrSearch. Applying default filters.")
                return slots_to_set + [FollowupAction("action_filter_products")]

        brand_lookup = build_brand_lookup(load_catalogue())
        if looks_like_product_query(raw_text, brand_lookup):
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        dispatcher.utter_message(response="utter_greet")
        return []


@lru_cache(maxsize=1)
def build_dynamic_attribute_registry() -> Dict[str, tuple[str, str]]:
    df = load_catalogue()
    registry: Dict[str, tuple[str, str]] = {}
    
    # IMPORTANT: frame_shape, frame_material, frame_color must come AFTER frame_style
    # so their registry entries overwrite frame_style collisions (e.g. 'square', 'round')
    target_columns = [
        "gender", "frame_style",
        "rim_type", "lens_feature", "polarized", "category", "product_type", 
        "brand", "use_case", "stock_status", "lightweight", "sports", 
        "office", "uv_protection", "blue_light",
        "frame_shape", "frame_material", "frame_color",
    ]
    
    for col in target_columns:
        if col in df.columns:
            unique_vals = df[col].dropna().unique()
            for val in unique_vals:
                val_str = str(val).strip()
                if not val_str or val_str.lower() in ("no", "false", "nan", "none"):
                    continue
                if val_str.lower() in ("yes", "true", "y"):
                    key = canonical_text_key(col.replace("_", " "))
                    if key:
                        registry[key] = (col, "Yes")
                else:
                    key = canonical_text_key(val_str)
                    if key:
                        registry[key] = (col, val_str)
                        if col in ("frame_shape", "frame_material", "frame_color", "gender", "category"):
                            tokens = key.split()
                            if len(tokens) > 1:
                                for token in tokens:
                                    if len(token) > 3 and token not in registry:
                                        registry[token] = (col, val_str)

    aliases = {
        # Gender
        "men": ("gender", "men"), "mens": ("gender", "men"), "male": ("gender", "men"), "boys": ("gender", "men"),
        "women": ("gender", "women"), "womens": ("gender", "women"), "female": ("gender", "women"), "girls": ("gender", "women"),
        "unisex": ("gender", "unisex"),
        # Category
        "glasses": ("category", "Frames"), "frames": ("category", "Frames"), "spectacles": ("category", "Frames"),
        "sunglasses": ("category", "Sunglasses"), "shades": ("category", "Sunglasses"),
        "contacts": ("category", "Contact Lenses"), "contact lenses": ("category", "Contact Lenses"),
        # Shape aliases (map to frame_shape — must use CSV-exact lowercase values)
        "round": ("frame_shape", "round"), "circular": ("frame_shape", "round"),
        "square": ("frame_shape", "square"), "square shaped": ("frame_shape", "square"),
        "rectangle": ("frame_shape", "rectangle"), "rectangular": ("frame_shape", "rectangle"),
        "aviator": ("frame_shape", "aviator"), "aviators": ("frame_shape", "aviator"),
        "cat eye": ("frame_shape", "cat-eye"), "cat-eye": ("frame_shape", "cat-eye"), "cateye": ("frame_shape", "cat-eye"),
        "oval": ("frame_shape", "oval"),
        # Material aliases (map to frame_material)
        "metal": ("frame_material", "metal"), "metallic": ("frame_material", "metal"),
        "titanium": ("frame_material", "titanium"),
        "acetate": ("frame_material", "acetate"), "plastic": ("frame_material", "acetate"),
        "rimless": ("frame_material", "rimless"),
        # Color aliases (map to frame_color)
        "black": ("frame_color", "black"),
        "brown": ("frame_color", "brown"),
        "silver": ("frame_color", "silver"),
        "gold": ("frame_color", "gold"), "golden": ("frame_color", "gold"),
        "tortoise": ("frame_color", "tortoise"), "tortoiseshell": ("frame_color", "tortoise"),
        # Use case / feature
        "blue light": ("lens_feature", "Blue Light"), "bluelight": ("lens_feature", "Blue Light"),
        "office": ("use_case", "Office"), "gaming": ("use_case", "Gaming"), "sports": ("use_case", "Sports"),
        "driving": ("use_case", "Driving"), "daily wear": ("use_case", "Daily"), "daily": ("use_case", "Daily"),
    }
    for k, v in aliases.items():
        registry[k] = v
        
    return registry

def extract_dynamic_attributes(text: str, registry: Dict[str, tuple[str, str]]) -> Dict[str, set]:
    extracted = {}
    normalized = canonical_text_key(text)
    words = normalized.split()
    
    ngrams = []
    for n in range(3, 0, -1):
        for i in range(len(words) - n + 1):
            ngrams.append(" ".join(words[i:i+n]))
            
    matched_tokens = set()
    for ngram in ngrams:
        tokens = ngram.split()
        if any(tok in matched_tokens for tok in tokens):
            continue
        if ngram in registry:
            col, val = registry[ngram]
            if col not in extracted:
                extracted[col] = set()
            extracted[col].add(val)
            for tok in tokens:
                matched_tokens.add(tok)
                
    return extracted

def is_refinement_query(query: str) -> bool:
    if not query:
        return False
    refinement_words = {"only", "instead", "same", "similar", "also", "show more", "narrower", "cheaper", "expensive", "another", "these", "those"}
    query_lower = query.lower()
    for word in refinement_words:
        if re.search(rf"\b{re.escape(word)}\b", query_lower):
            return True
    return False

# ── Strict gender matching ────────────────────────────────────────────
_GENDER_SYNONYMS: Dict[str, set] = {
    "men":    {"men", "male", "mens", "man", "boys"},
    "women":  {"women", "female", "womens", "woman", "girls"},
    "unisex": {"unisex"},
}

def _gender_match_set(requested: str) -> set:
    """Return the set of CSV gender values that satisfy *requested*."""
    key = requested.strip().lower()
    for canonical, synonyms in _GENDER_SYNONYMS.items():
        if key in synonyms:
            return {canonical}          # exact CSV value
    return {key}                        # unknown → pass-through

def _build_strict_gender_mask(df: pd.DataFrame, requested_genders: set) -> pd.Series:
    """Return a boolean mask that is True only for rows whose gender
    exactly matches one of the requested genders (no substring tricks)."""
    allowed: set = set()
    for rg in requested_genders:
        allowed.update(_gender_match_set(rg))
    col_lower = df["gender"].astype(str).str.strip().str.lower()
    return col_lower.isin(allowed)


def search_products_engine(
    raw_text: str, 
    tracker: Tracker, 
    lang: str, 
    intent_name: str,
    dispatcher: CollectingDispatcher
) -> tuple[List[Dict[str, Any]], bool]:
    events: List[Dict[Text, Any]] = []
    normalized = normalize_search_text(raw_text)
    df = load_catalogue().copy()
    registry = build_dynamic_attribute_registry()

    def payload_flag(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "y"}

    def budget_label(minimum: Optional[float], maximum: Optional[float]) -> str:
        if minimum is not None and maximum is not None:
            return f"between RM{minimum:g} and RM{maximum:g}"
        if minimum is not None:
            return f"above RM{minimum:g}"
        if maximum is not None:
            return f"under RM{maximum:g}"
        return ""

    def is_show_all_brand(value: Any) -> bool:
        return str(value or "").strip().lower() in {"show all brands", "all brands", "any", "any brand"}

    def row_matches(row: pd.Series, column: str, values: set) -> bool:
        if column == "gender":
            allowed: set = set()
            for requested in values:
                allowed.update(_gender_match_set(requested))
            return str(row.get("gender", "")).strip().lower() in allowed
        if column == "brand":
            allowed_brands = {str(value).strip().lower() for value in values}
            return str(row.get("brand", "")).strip().lower() in allowed_brands
        if column == "product_type":
            allowed_product_types = {str(value).strip().lower() for value in values}
            return str(row.get("product_type", "")).strip().lower() in allowed_product_types
        candidate = str(row.get(column, ""))
        return any(re.search(re.escape(value), candidate, re.IGNORECASE) for value in values)

    def apply_filters(source: pd.DataFrame, filters: Dict[str, set]) -> pd.DataFrame:
        filtered_df = source.copy()
        ordered = [col for col in ["product_type", "brand", "gender", "frame_shape", "frame_material", "frame_color", "use_case"] if col in filters]
        remaining = [col for col in filters if col not in ordered]
        for col in [*ordered, *remaining]:
            if col not in filtered_df.columns:
                continue
            values = filters[col]
            if col == "gender":
                filtered_df = filtered_df[_build_strict_gender_mask(filtered_df, values)]
            elif col == "brand":
                allowed_brands = {str(value).strip().lower() for value in values}
                filtered_df = filtered_df[filtered_df["brand"].astype(str).str.strip().str.lower().isin(allowed_brands)]
            elif col == "product_type":
                allowed_product_types = {str(value).strip().lower() for value in values}
                filtered_df = filtered_df[filtered_df["product_type"].astype(str).str.strip().str.lower().isin(allowed_product_types)]
            else:
                masks = [filtered_df[col].astype(str).str.contains(re.escape(value), case=False, na=False) for value in values]
                if masks:
                    filtered_df = filtered_df[pd.concat(masks, axis=1).any(axis=1)]
        return filtered_df

    payload: Dict[str, Any] = {}
    current_filters: Dict[str, set] = {}
    current_b_min = None
    current_b_max = None
    current_price_range: Optional[str] = None
    allow_similar_requested = False
    current_budget_provided = False
    clear_brand_filter = False

    if raw_text.startswith("/"):
        try:
            start = raw_text.find("{")
            if start != -1:
                payload = json.loads(raw_text[start:])
                allow_similar_requested = payload_flag(payload.get("allow_similar"))
                if "budget_min" in payload:
                    current_b_min = payload["budget_min"]
                    current_budget_provided = True
                if "budget_max" in payload:
                    current_b_max = payload["budget_max"]
                    current_budget_provided = True
                if "budget_bucket" in payload:
                    current_budget_provided = True
                if "price_range" in payload:
                    current_price_range = str(payload["price_range"])
                    current_budget_provided = True
                    parsed_payload_budget = parse_budget_from_text(current_price_range)
                    if parsed_payload_budget:
                        if parsed_payload_budget.get("budget_min") is not None:
                            current_b_min = parsed_payload_budget["budget_min"]
                        if parsed_payload_budget.get("budget_max") is not None:
                            current_b_max = parsed_payload_budget["budget_max"]
                for k, v in payload.items():
                    if k not in ["allow_similar", "budget_min", "budget_max", "budget_bucket", "price_range"]:
                        if k == "brand" and is_show_all_brand(v):
                            clear_brand_filter = True
                            continue
                        current_filters[k] = {str(v)}
        except Exception:
            payload = {}

    extracted_text = extract_dynamic_attributes(normalized, registry)
    for k, v in extracted_text.items():
        if k not in current_filters:
            current_filters[k] = set()
        current_filters[k].update(v)

    parsed_budget = None if raw_text.startswith("/") else parse_budget_from_text(normalized)
    if parsed_budget:
        current_budget_provided = True
        if parsed_budget.get("budget_min") is not None:
            current_b_min = parsed_budget["budget_min"]
        if parsed_budget.get("budget_max") is not None:
            current_b_max = parsed_budget["budget_max"]

    previous_filters: Dict[str, str] = {}
    for slot in ["gender", "product_type", "brand", "frame_shape", "frame_material", "frame_color", "category", "use_case"]:
        val = tracker.get_slot(slot)
        if slot == "brand" and is_show_all_brand(val):
            clear_brand_filter = True
            continue
        if val:
            previous_filters[slot] = str(val)
    prev_b_min = tracker.get_slot("budget_min")
    prev_b_max = tracker.get_slot("budget_max")

    is_refinement = intent_name == "select_budget" or is_refinement_query(normalized) or allow_similar_requested

    extracted: Dict[str, set] = {}
    b_min, b_max = current_b_min, current_b_max

    if is_refinement:
        for k, v in previous_filters.items():
            extracted[k] = {v}
        if not current_budget_provided:
            if b_min is None and prev_b_min is not None:
                b_min = prev_b_min
            if b_max is None and prev_b_max is not None:
                b_max = prev_b_max
        for k, v in current_filters.items():
            if k not in extracted:
                extracted[k] = set()
            extracted[k].update(v)
    else:
        extracted = current_filters
        for slot in MANAGED_SLOTS:
            events.append(SlotSet(slot, None))

    try:
        b_min = float(b_min) if b_min is not None else None
    except (ValueError, TypeError):
        b_min = None
    try:
        b_max = float(b_max) if b_max is not None else None
    except (ValueError, TypeError):
        b_max = None

    if "product_type" not in extracted and "category" in extracted:
        product_types_from_category = set()
        for category in extracted["category"]:
            category_key = str(category).strip().lower()
            mapped_product_type = {
                "frames": "Designer Frames",
                "sunglasses": "Luxury Sunglasses",
                "contact lenses": "Contact Lenses",
            }.get(category_key)
            if mapped_product_type:
                product_types_from_category.add(mapped_product_type)
        if product_types_from_category:
            extracted["product_type"] = product_types_from_category
    extracted.pop("category", None)

    filtered = df.copy()
    filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
    priority_filters = {
        key: value
        for key, value in extracted.items()
        if key in {"product_type", "brand"}
    }
    style_filters = {
        key: value
        for key, value in extracted.items()
        if key not in {"product_type", "brand", "category"}
    }
    filtered = apply_filters(filtered, priority_filters)
    if b_min is not None:
        filtered = filtered[filtered["price_myr"] > b_min]
    if b_max is not None:
        filtered = filtered[filtered["price_myr"] <= b_max]
    filtered = apply_filters(filtered, style_filters)

    debug_logs = {
        "query": raw_text,
        "is_refinement": is_refinement,
        "allow_similar_requested": allow_similar_requested,
        "previous_filters": previous_filters,
        "current_filters": {k: list(v) for k, v in current_filters.items()},
        "final_filters": {k: list(v) for k, v in extracted.items()},
        "strict_results": len(filtered),
    }
    if b_min is not None:
        debug_logs["final_filters"]["budget_min"] = b_min
    if b_max is not None:
        debug_logs["final_filters"]["budget_max"] = b_max

    relaxed_flags: List[str] = []
    fallback_mode = False

    if filtered.empty and allow_similar_requested:
        fallback_mode = True
        relaxed_filtered = df.copy()
        relaxed_filtered["price_myr"] = pd.to_numeric(relaxed_filtered["price_myr"], errors="coerce")
        locked_filters = {
            key: value
            for key, value in extracted.items()
            if key in {"product_type", "gender"}
        }
        optional_filters = {
            key: set(value)
            for key, value in extracted.items()
            if key not in {"product_type", "gender", "category"}
        }
        relaxed_filtered = apply_filters(relaxed_filtered, locked_filters)
        if b_min is not None:
            relaxed_filtered = relaxed_filtered[relaxed_filtered["price_myr"] > b_min]
        if b_max is not None:
            relaxed_filtered = relaxed_filtered[relaxed_filtered["price_myr"] <= b_max]
        relax_order = ["brand", "frame_shape", "frame_material", "frame_color", "use_case"]

        for step in range(len(relax_order) + 1):
            temp_filtered = apply_filters(relaxed_filtered, optional_filters)
            if not temp_filtered.empty:
                filtered = temp_filtered
                break
            if step < len(relax_order):
                col_to_relax = relax_order[step]
                if col_to_relax in optional_filters:
                    del optional_filters[col_to_relax]
                    relaxed_flags.append(col_to_relax)

        debug_logs["relaxed_filters"] = relaxed_flags
        debug_logs["fallback_results"] = len(filtered)

    logger.info(json.dumps(debug_logs))

    brand_value = list(extracted["brand"])[0] if "brand" in extracted and extracted["brand"] else ""
    product_type_value = list(extracted["product_type"])[0] if "product_type" in extracted and extracted["product_type"] else ""
    use_case_value = list(extracted["use_case"])[0] if "use_case" in extracted and extracted["use_case"] else ""

    if filtered.empty and not allow_similar_requested:
        for col, values in extracted.items():
            if col in MANAGED_SLOTS and values:
                events.append(SlotSet(col, list(values)[0]))
        if clear_brand_filter:
            events.append(SlotSet("brand", None))
        if b_min is not None:
            events.append(SlotSet("budget_min", b_min))
        elif current_budget_provided:
            events.append(SlotSet("budget_min", None))
        if b_max is not None:
            events.append(SlotSet("budget_max", b_max))
        elif current_budget_provided:
            events.append(SlotSet("budget_max", None))
        if current_price_range is not None:
            events.append(SlotSet("price_range", current_price_range))
        elif current_budget_provided:
            events.append(SlotSet("price_range", None))

        product_type_label = product_type_value or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        brand_label = brand_value or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        budget_text = budget_label(b_min, b_max)
        budget_label_text = budget_text or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        msg = tr(
            lang,
            (
                "We currently do not have matching products for:\n"
                f"- Product Type: {product_type_label}\n"
                f"- Brand: {brand_label}\n"
                f"- Budget: {budget_label_text}\n\n"
                "Would you like to:\n"
                "- View similar brands\n"
                "- Change budget\n"
                "- Explore other product categories"
            ),
            (
                "Kami belum mempunyai produk yang sepadan untuk:\n"
                f"- Jenis Produk: {product_type_label}\n"
                f"- Jenama: {brand_label}\n"
                f"- Bajet: {budget_label_text}\n\n"
                "Adakah anda mahu:\n"
                "- Lihat jenama serupa\n"
                "- Ubah bajet\n"
                "- Teroka kategori produk lain"
            ),
            (
                "目前没有符合以下条件的产品：\n"
                f"- 产品类型：{product_type_label}\n"
                f"- 品牌：{brand_label}\n"
                f"- 预算：{budget_label_text}\n\n"
                "您想要：\n"
                "- 查看相近品牌\n"
                "- 更改预算\n"
                "- 探索其他产品类别"
            ),
        )
        dispatcher.utter_message(
            text=msg,
            buttons=[
                {"title": tr(lang, "View Similar Brands", "Lihat Jenama Serupa", "查看相近品牌"), "payload": '/search_product{"allow_similar":true}'},
                {"title": tr(lang, "Change Filters", "Ubah Penapis", "更改筛选"), "payload": "/browse_eyewear"},
            ],
        )
        return events, False

    if filtered.empty:
        dispatcher.utter_message(
            text=tr(
                lang,
                "I still could not find suitable alternatives in that product type and budget. If you want, I can help you adjust the brand or price range next.",
                "Saya masih tidak menemui alternatif yang sesuai dalam jenis produk dan bajet tersebut. Jika anda mahu, saya boleh bantu laraskan jenama atau julat harga seterusnya.",
                "在该类别和预算内，我仍然找不到合适的相近款式。如果您愿意，我可以继续帮您调整品牌或价格范围。",
            )
        )
        return events, False

    ranking_type = product_type_value or None
    ranking_brand = None if "brand" in relaxed_flags else (brand_value or None)
    ranked = rank_products_safely(filtered, product_type=ranking_type, brand=ranking_brand, use_case=use_case_value or None)
    top_results = ranked.head(5)

    if not extracted and b_min is None and b_max is None:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Here are some popular picks right now:",
                "Berikut pilihan popular ketika ini:",
                "这是目前的热门推荐："
            )
        )
    elif fallback_mode:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Closest matching products in the same product type and budget:",
                "Pilihan paling hampir dalam jenis produk dan bajet yang sama:",
                "以下是同类别、同预算下最接近的可选款式："
            )
        )
    else:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Recommended options matching your selected filters:",
                "Pilihan disyorkan yang sepadan dengan penapis pilihan anda:",
                "以下是符合您已选筛选条件的推荐款式："
            )
        )

    required_validation = {key: set(value) for key, value in extracted.items()}
    if fallback_mode:
        for relaxed in relaxed_flags:
            required_validation.pop(relaxed, None)

    emitted_count = 0
    for _, row in top_results.iterrows():
        p_price = pd.to_numeric(row.get("price_myr"), errors="coerce")
        if pd.isna(p_price):
            p_price = 0
        if b_max is not None and p_price > b_max:
            continue
        if b_min is not None and p_price <= b_min:
            continue
        if any(not row_matches(row, col, values) for col, values in required_validation.items() if col in row.index):
            continue
        emit_product_card(dispatcher, row.to_dict(), str(ranking_type) if ranking_type else "", lang)
        emitted_count += 1

    if emitted_count == 0:
        if clear_brand_filter:
            events.append(SlotSet("brand", None))
        if b_min is not None:
            events.append(SlotSet("budget_min", b_min))
        elif current_budget_provided:
            events.append(SlotSet("budget_min", None))
        if b_max is not None:
            events.append(SlotSet("budget_max", b_max))
        elif current_budget_provided:
            events.append(SlotSet("budget_max", None))
        if current_price_range is not None:
            events.append(SlotSet("price_range", current_price_range))
        elif current_budget_provided:
            events.append(SlotSet("price_range", None))
        dispatcher.utter_message(
            text=tr(
                lang,
                "I couldn't find products that safely meet those filters.",
                "Saya tidak menemui produk yang benar-benar memenuhi penapis tersebut.",
                "我没有找到能稳妥满足这些筛选条件的产品。",
            )
        )
        return events, False

    for col, values in extracted.items():
        if col in MANAGED_SLOTS:
            events.append(SlotSet(col, list(values)[0]))
    if clear_brand_filter:
        events.append(SlotSet("brand", None))
    if b_min is not None:
        events.append(SlotSet("budget_min", b_min))
    elif current_budget_provided:
        events.append(SlotSet("budget_min", None))
    if b_max is not None:
        events.append(SlotSet("budget_max", b_max))
    elif current_budget_provided:
        events.append(SlotSet("budget_max", None))
    if current_price_range is not None:
        events.append(SlotSet("price_range", current_price_range))
    elif current_budget_provided:
        events.append(SlotSet("price_range", None))

    return events, True

class ActionSmartSearch(Action):
    def name(self) -> Text:
        return "action_smart_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        intent_name = intent.get("name") if intent else ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        
        if support_intent:
            switch = detect_domain_switch(tracker, intent_name, raw_text, support_intent)
            reset_events: List[Dict[Text, Any]] = []
            if switch["detected"]:
                reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
                logger.info({
                    "previous_intent": switch["previous_intent"],
                    "new_intent": switch["new_intent"],
                    "domain_switch_detected": True,
                    "cleared_active_loop": cleared_active_loop,
                    "cleared_slots": cleared_slots,
                })
            logger.info({
                "intent": intent_name,
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]

        lang = get_language(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent_name, raw_text, support_intent))
        events.extend(flow_entry_events(tracker, "product_search"))

        search_events, success = search_products_engine(raw_text, tracker, lang, intent_name, dispatcher)
        events.extend(search_events)
        if not success:
            events.append(FollowupAction("action_listen"))

        return events


class ActionDocumentSearch(Action):
    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_query = (tracker.latest_message.get("text") or "").strip()
        lang = get_language(tracker)
        if not raw_query:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Could you please rephrase your question? I didn't catch that.",
                    "Boleh anda nyatakan semula soalan anda? Saya kurang pasti.",
                    "您能换个说法问吗？我没听懂。"
                )
            )
            return []

        try:
            faq_entries = list(load_kb_metadata())
        except RuntimeError as exc:
            logger.error("Knowledge base load failed: %s", exc)
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I can't reach the knowledge base right now. Please try again in a moment or contact support.",
                    "Pangkalan pengetahuan tidak dapat diakses buat masa ini. Sila cuba lagi atau hubungi sokongan.",
                    "暂时无法访问知识库，请稍后再试或联系客服。",
                ),
            )
            return []

        latest_intent = (tracker.latest_message.get("intent") or {}).get("name") or ""
        faq_boost = latest_intent == "ask_faq"
        query_lower = raw_query.lower()

        keyword_groups = {
            "refund": {"refund", "return", "exchange", "policy", "size", "fit"},
            "warranty": {"warranty", "cover", "broken", "damage"},
            "booking": {"book", "appointment", "eye test", "online"},
            "after_sales": {"adjustment", "after-sales", "after sales", "fitting", "support"},
            "stores": {"store", "location", "branch", "outlet"},
        }

        requested_group: Optional[str] = None
        for group_name, keywords in keyword_groups.items():
            if any(keyword in query_lower for keyword in keywords):
                requested_group = group_name
                break

        best_result = None
        best_score = 0
        if faq_entries:
            ranked = []
            for entry in faq_entries:
                text = str(entry.get("text") or "").strip()
                if not text:
                    continue

                source = str(entry.get("source") or "").lower()
                score = 0
                if faq_boost and "faq" in source:
                    score += 2
                if requested_group == "refund":
                    score += 5 if "refund or return policy" in text.lower() else 0
                    score += 2 if "refund" in text.lower() else 0
                    score += 2 if "exchange" in text.lower() else 0
                elif requested_group == "warranty":
                    score += 3 if "warranty" in text.lower() else 0
                elif requested_group == "booking":
                    score += 3 if "book an eye test online" in text.lower() else 0
                elif requested_group == "after_sales":
                    score += 3 if "after-sales support" in text.lower() else 0
                elif requested_group == "stores":
                    score += 3 if "stores located" in text.lower() else 0

                for token in re.findall(r"[a-z0-9]+", query_lower):
                    if len(token) > 2 and token in text.lower():
                        score += 1

                if score > 0:
                    ranked.append((score, entry))

            if ranked:
                ranked.sort(key=lambda item: item[0], reverse=True)
                best_score = ranked[0][0]
                best_result = ranked[0][1]

        if not best_result:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I'm sorry, I couldn't find that information in the Calisto knowledge base.\n\nYou can try rephrasing, or I can connect you to support.",
                    "Maaf, saya tidak temui maklumat tersebut.\n\nAnda boleh cuba lagi, atau saya boleh hubungkan anda dengan sokongan.",
                    "抱歉，我找不到该信息。\n\n您可以重新描述，或者我帮您联系客服。"
                )
            )
        else:
            answer = best_result.get("text", "").strip()
            
            # Simple clean up of answer
            if " A:" in answer:
                answer = answer.split(" A:", 1)[1].strip()
            if " Q:" in answer:
                answer = answer.split(" Q:", 1)[0].strip()

            words = answer.split()
            if len(words) > 150:
                answer = " ".join(words[:150]) + " ..."

            logger.info(
                "Matched knowledge-base source '%s' with score %.3f",
                best_result.get("source", "unknown"),
                float(best_score),
            )
            dispatcher.utter_message(text=f"📄 {answer}")

        # Provide contextual follow up instead of escalating automatically
        if requested_group == "warranty":
            dispatcher.utter_message(response="utter_warranty_policy_menu")
        elif requested_group == "refund":
            dispatcher.utter_message(response="utter_return_policy_menu")
        else:
            dispatcher.utter_message(response="utter_support_actions_menu")
            
        return []


class ActionPrefillLeadCapture(Action):
    def name(self) -> Text:
        return "action_prefill_lead_capture"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        metadata = latest_metadata(tracker)
        events: List[Dict[Text, Any]] = flow_entry_events(tracker, "lead_capture")

        slot_mappings = {
            "lead_name": metadata.get("senderName"),
            "contact_number": metadata.get("phone"),
            "email": metadata.get("email"),
            "lead_location": metadata.get("location"),
            "preferred_service": metadata.get("preferred_service") or infer_service_from_intent(tracker),
        }

        for slot_name, value in slot_mappings.items():
            if slot_name == "preferred_service":
                inferred = metadata.get("preferred_service") or infer_service_from_intent(tracker)
                if inferred:
                    events.append(SlotSet("preferred_service", inferred))
                    continue
            if tracker.get_slot(slot_name):
                continue
            normalized = str(value).strip() if isinstance(value, str) else ""
            if normalized:
                events.append(SlotSet(slot_name, normalized))
        return events


class ValidateLeadCaptureForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_lead_capture_form"

    def _reject_slot(
        self,
        slot_name: str,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        retry_text: str,
    ) -> Dict[Text, Any]:
        intent = get_latest_intent(tracker)
        requested_slot = tracker.get_slot("requested_slot") or slot_name

        if intent["name"] in FORM_INTERRUPTION_INTENTS and intent["confidence"] >= INTENT_CONFIDENCE_THRESHOLD:
            return {
                slot_name: None,
                "requested_slot": None,
                "current_flow": resolve_interruption_flow(tracker, intent["name"]),
            }
            
        # Count how many times bot has asked for this slot (search full history)
        ask_count = 0
        for event in tracker.events:
            if event.get("event") == "action" and event.get("name") == f"utter_ask_{requested_slot}":
                ask_count += 1
            if event.get("event") == "bot":
                metadata_action = event.get("metadata", {}).get("utter_action", "")
                if metadata_action == f"utter_ask_{requested_slot}":
                    ask_count += 1

        if ask_count >= 2:
            # Skip this slot — already asked twice
            logger.info("[FORM] slot=%s asked %d times, skipping", requested_slot, ask_count)
            return {slot_name: "skipped"}

        dispatcher.utter_message(text=retry_text)
        dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
        return {slot_name: None}

    async def validate_lead_name(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_name(slot_value)
        if not is_valid_name(value):
            return self._reject_slot(
                "lead_name",
                dispatcher,
                tracker,
                tr(lang, "Please share your name only, without a product question or request.", "Sila kongsi nama anda sahaja, tanpa soalan atau permintaan produk.", "请只提供您的姓名，不要附带产品问题或请求。"),
            )
        return {"lead_name": value}

    async def validate_contact_number(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        if not is_valid_phone(slot_value):
            return self._reject_slot(
                "contact_number",
                dispatcher,
                tracker,
                tr(lang, "Please provide a valid phone number including area or country code.", "Sila berikan nombor telefon yang sah termasuk kod kawasan atau negara.", "请输入有效的电话号码，并包含区号或国家代码。"),
            )
        return {"contact_number": normalize_phone(slot_value)}

    async def validate_email(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        if not is_valid_email(slot_value):
            return self._reject_slot(
                "email",
                dispatcher,
                tracker,
                tr(lang, "Please provide a valid email address.", "Sila berikan alamat e-mel yang sah.", "请输入有效的电子邮箱地址。"),
            )
        return {"email": normalize_email(slot_value)}

    async def validate_lead_location(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        resolved_city = resolve_city(value)
        if resolved_city:
            return {"lead_location": resolved_city}

        if not is_valid_location(value) or not is_probable_location(value):
            return self._reject_slot(
                "lead_location",
                dispatcher,
                tracker,
                tr(lang, "Please share your city or area so we can route your inquiry properly.", "Sila kongsi bandar atau kawasan anda supaya kami boleh arahkan pertanyaan anda dengan betul.", "请提供您所在的城市或区域，以便我们正确安排您的咨询。"),
            )
        return {"lead_location": value}

    async def validate_preferred_service(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        if not is_valid_service(value):
            return self._reject_slot(
                "preferred_service",
                dispatcher,
                tracker,
                tr(lang, "Please tell us which product or service you are interested in.", "Sila beritahu kami produk atau perkhidmatan yang anda minati.", "请告诉我们您感兴趣的产品或服务。"),
            )
        return {"preferred_service": value}

    async def validate_purchase_timeline(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        normalized = normalize_timeline(value)
        if normalized:
            return {"purchase_timeline": normalized}
        return self._reject_slot(
            "purchase_timeline",
            dispatcher,
            tracker,
            tr(lang, "Let me know if you are ready this week, within 2 weeks, or just exploring.", "Beritahu saya sama ada anda bersedia minggu ini, dalam 2 minggu, atau sekadar melihat-lihat.", "请告诉我您是本周决定、两周内决定，还是先看看。"),
        )


class ActionHandleLeadCaptureInterruption(Action):
    def name(self) -> Text:
        return "action_handle_lead_capture_interruption"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        intent = get_latest_intent(tracker)
        requested_slot = str(tracker.get_slot("requested_slot") or "").strip()
        intent_name = intent["name"]
        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)

        switch = detect_domain_switch(tracker, intent_name, raw_text, support_intent)
        should_interrupt = bool(
            switch["detected"]
            or (intent_name in FORM_INTERRUPTION_INTENTS and intent["confidence"] >= INTENT_CONFIDENCE_THRESHOLD)
        )

        if not should_interrupt:
            dispatcher.utter_message(text=tr(lang, "I still need that detail to continue.", "Saya masih perlukan butiran itu untuk teruskan.", "我还需要这项信息才能继续。"))
            if requested_slot:
                dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
            return []

        events: List[Dict[Text, Any]] = []
        if switch["detected"]:
            reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
            logger.info({
                "previous_intent": switch["previous_intent"],
                "new_intent": switch["new_intent"],
                "domain_switch_detected": True,
                "cleared_active_loop": cleared_active_loop,
                "cleared_slots": cleared_slots,
            })
            events.extend(reset_events)
        else:
            events.extend([
                SlotSet("requested_slot", None),
                ActiveLoop(None),
                SlotSet("current_flow", resolve_interruption_flow(tracker, intent_name)),
            ])

        if support_intent:
            logger.info({
                "intent": "lead_capture_interruption",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
            })
            events.extend(route_support_flow(dispatcher, tracker, support_intent))
            return events

        if intent_name == "browse_eyewear":
            events.extend(ActionResetEyewearSlots().run(dispatcher, tracker, domain))
            dispatcher.utter_message(response="utter_ask_product_type")
        elif intent_name == "ask_pricing":
            dispatcher.utter_message(response="utter_pricing_intro")
        elif intent_name == "select_pricing_category":
            events.extend(ActionShowPricing().run(dispatcher, tracker, domain))
        elif intent_name in {"lens_vision_solutions", "ask_lens_type"}:
            if intent_name == "ask_lens_type":
                events.extend(ActionExplainLens().run(dispatcher, tracker, domain))
            else:
                dispatcher.utter_message(response="utter_ask_lens_type")
        elif intent_name == "find_a_store":
            events.extend(ActionAskCity().run(dispatcher, tracker, domain))
        elif intent_name == "choose_city":
            events.extend(ActionFindStore().run(dispatcher, tracker, domain))
        elif intent_name == "store_hours":
            events.extend(ActionHandleStoreHours().run(dispatcher, tracker, domain))
        elif intent_name == "search_product":
            events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "search_product_by_attribute":
            events.extend(ActionSearchProductByAttribute().run(dispatcher, tracker, domain))
        elif intent_name in {"product_recommendation", "inform_budget"}:
            events.extend(ActionRecommendProducts().run(dispatcher, tracker, domain))
        elif intent_name == "select_product_type":
            events.extend(ActionAskBrand().run(dispatcher, tracker, domain))
        elif intent_name == "select_brand":
            events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "select_budget":
            target_flow = resolve_interruption_flow(tracker, intent_name)
            if target_flow == "lens_consultation":
                events.extend(ActionFilterLenses().run(dispatcher, tracker, domain))
            else:
                events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "ask_faq":
            events.append(FollowupAction("action_document_search"))
        elif intent_name == "email_support":
            dispatcher.utter_message(response="utter_email_support")
        else:
            if switch["detected"] and switch["new_domain"] == "shopping":
                events.extend(ActionSmartSearch().run(dispatcher, tracker, domain))
                return events
            if switch["detected"] and switch["new_domain"] == "lens":
                events.extend(ActionExplainLens().run(dispatcher, tracker, domain))
                return events
            if requested_slot:
                dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
            return []

        return events


class ActionResetEyewearSlots(Action):
    def name(self) -> Text:
        return "action_reset_eyewear_slots"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "browse_eyewear"))
        events.extend([
            SlotSet("product_type", None),
            SlotSet("brand", None),
            SlotSet("price_range", None),
            SlotSet("frame_shape", None),
            SlotSet("frame_color", None),
            SlotSet("frame_material", None),
            SlotSet("lens_type", None),
            SlotSet("city", None),
        ])
        return events


class ActionFilterProducts(Action):
    def name(self) -> Text:
        return "action_filter_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        return ActionSmartSearch().run(dispatcher, tracker, domain)


class ActionExplainLens(Action):
    def name(self) -> Text:
        return "action_explain_lens"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "lens_consultation"))
        lang = get_language(tracker)
        lens_type = tracker.get_slot("lens_type")
        explanations = {
            "Single Vision Lenses": "Single vision lenses have one prescription power across the lens and are ideal for distance or near correction.",
            "Progressive Lenses": "Progressive lenses combine near, intermediate, and distance vision without visible lines.",
            "Blue Light Protection": "Blue light lenses help reduce digital eye strain and filter high-energy visible light from screens.",
            "Photochromic Lenses": "Photochromic lenses darken outdoors and turn clear indoors for all-day convenience.",
        }
        if lens_type in explanations:
            dispatcher.utter_message(text=explanations[lens_type])
        else:
            dispatcher.utter_message(text=tr(lang, "I can explain different lens solutions if you tell me which one you are considering.", "Saya boleh terangkan pilihan kanta yang berbeza jika anda beritahu yang mana anda sedang pertimbangkan.", "如果您告诉我您正在考虑哪一种，我可以为您解释不同的镜片方案。"))
        dispatcher.utter_message(
            text=tr(lang, "If you want, I can help you compare more lens options, find a store, or arrange a consultation.", "Jika anda mahu, saya boleh bantu bandingkan lebih banyak pilihan kanta, cari kedai, atau aturkan konsultasi.", "如果您愿意，我可以帮您比较更多镜片方案、查找门店，或安排咨询。"),
            buttons=[
                {"title": tr(lang, "Set Budget", "Tetapkan Bajet", "设置预算"), "payload": '/select_budget{"price_range":"RM100 - RM250"}'},
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
            ],
        )
        return events


class ActionAskCity(Action):
    def name(self) -> Text:
        return "action_ask_city"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        # Check latest entities first (message-level), then slots
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or tracker.get_slot("city")
            or tracker.get_slot("lead_location")
        )
        # Also scan the raw message for city names if no entity/slot
        if not city_candidate:
            msg = tracker.latest_message.get("text") or ""
            city_candidate = resolve_city(msg) or None
        resolved_city = resolve_city(city_candidate)
        if resolved_city:
            city = resolved_city
            backend_stores = gateway.search_stores(city)
            if backend_stores:
                for store in backend_stores[:6]:
                    emit_store_card(
                        dispatcher,
                        str(store.get("store_location", "Calisto Store")),
                        str(store.get("city", city)),
                        lang,
                    )
                events.append(SlotSet("city", city))
                return events

            stores = search_store_rows(load_catalogue(), city)
            if stores.empty:
                dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
                events.append(SlotSet("city", city))
                return events

            for _, row in stores.head(6).iterrows():
                emit_store_card(
                    dispatcher,
                    str(row.get("store_location", "Calisto Store")),
                    str(row.get("city", city)),
                    lang,
                )
            events.append(SlotSet("city", city))
            return events

        if tracker.get_slot("city") is not None:
            events.append(SlotSet("city", None))

        cities = unique_cities(load_catalogue())
        buttons = [
            {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
            for city in cities[:10]
        ]
        dispatcher.utter_message(text=tr(lang, "Which city are you looking for?", "Bandar mana yang anda cari?", "您想查哪个城市？"), buttons=buttons or None)
        return events


class ActionFindStore(Action):
    def name(self) -> Text:
        return "action_find_store"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        city_candidate = tracker.get_slot("city") or tracker.get_slot("lead_location")
        city = resolve_city(city_candidate)
        if not city:
            dispatcher.utter_message(text=tr(lang, "Please specify the city to find a store.", "Sila nyatakan bandar untuk mencari kedai.", "请提供要查询的城市。"))
            if tracker.get_slot("city") is not None:
                events.append(SlotSet("city", None))
            return events

        backend_stores = gateway.search_stores(str(city))
        if backend_stores:
            for store in backend_stores[:6]:
                emit_store_card(
                    dispatcher,
                    str(store.get('store_location', 'Calisto Store')),
                    str(store.get('city', city)),
                    lang,
                )
            return events

        stores = search_store_rows(load_catalogue(), str(city))
        if stores.empty:
            dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
            return events

        for _, row in stores.head(6).iterrows():
            emit_store_card(
                dispatcher,
                str(row.get('store_location', 'Calisto Store')),
                str(row.get('city', city)),
                lang,
            )
        return events


class ActionHandleStoreHours(Action):
    def name(self) -> Text:
        return "action_handle_store_hours"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or tracker.get_slot("city")
            or tracker.get_slot("lead_location")
        )
        if not city_candidate:
            msg = tracker.latest_message.get("text") or ""
            city_candidate = resolve_city(msg) or None
        city = resolve_city(city_candidate)
        if city:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    f"Most Calisto stores in {titleize(str(city))} typically follow mall operating hours, usually around {DEFAULT_STORE_HOURS}. I recommend confirming before visiting.",
                    f"Kebanyakan kedai Calisto di {titleize(str(city))} biasanya mengikut waktu operasi pusat beli-belah, sekitar {DEFAULT_STORE_HOURS}. Saya syorkan anda sahkan dahulu sebelum datang.",
                    f"{titleize(str(city))} 的大多数 Calisto 门店通常跟随商场营业时间，一般为 {DEFAULT_STORE_HOURS}。建议您到店前先确认。"
                ),
                buttons=[
                    {"title": tr(lang, "Show Stores", "Lihat Kedai", "查看门店"), "payload": f'/choose_city{{"city":"{city}"}}'},
                    {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
                ],
            )
            return events

        dispatcher.utter_message(
            text=tr(lang, f"Most Calisto stores typically follow mall operating hours, usually around {DEFAULT_STORE_HOURS}. If you tell me the city or mall, I can point you to the right location.", f"Kebanyakan kedai Calisto biasanya mengikut waktu operasi pusat beli-belah, sekitar {DEFAULT_STORE_HOURS}. Jika anda beritahu bandar atau pusat beli-belah, saya boleh tunjuk lokasi yang sesuai.", f"大多数 Calisto 门店通常跟随商场营业时间，一般为 {DEFAULT_STORE_HOURS}。如果您告诉我城市或商场，我可以为您找到对应门店。"),
            buttons=[
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
            ],
        )
        return events


class ActionShowPricing(Action):
    def name(self) -> Text:
        return "action_show_pricing"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "pricing"))
        lang = get_language(tracker)
        entities = canonicalize_entities(latest_entity_values(tracker))
        preferred_service = str(
            entities.get("preferred_service")
            or tracker.get_slot("preferred_service")
            or "Designer Frames"
        ).strip()
        preferred_service = canonicalize_slot_value("preferred_service", preferred_service)

        pricing_map: Dict[str, Dict[str, Any]] = {
            "Designer Frames": {
                "headline": tr(lang, "Designer Frame Pricing", "Harga Bingkai Pereka", "设计师镜框价格"),
                "lines": [
                    tr(lang, "Entry styles: RM180-RM320", "Gaya asas: RM180-RM320", "入门款：RM180-RM320"),
                    tr(lang, "Premium acetate and metal frames: RM320-RM680", "Bingkai asetat dan logam premium: RM320-RM680", "高级板材与金属镜框：RM320-RM680"),
                    tr(lang, "Luxury designer labels: RM680-RM1,280+", "Jenama pereka mewah: RM680-RM1,280+", "奢华设计师品牌：RM680-RM1,280+"),
                ],
                "note": tr(lang, "Final pricing depends on brand, material, and lens package.", "Harga akhir bergantung pada jenama, bahan, dan pakej kanta.", "最终价格取决于品牌、材质和镜片搭配。"),
                "buttons": [
                    {"title": tr(lang, "Browse Frames", "Lihat Bingkai", "浏览镜框"), "payload": '/select_product_type{"product_type":"Designer Frames"}'},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Designer Frames"}'},
                ],
            },
            "Luxury Sunglasses": {
                "headline": tr(lang, "Sunglass Pricing", "Harga Cermin Mata Hitam", "太阳镜价格"),
                "lines": [
                    tr(lang, "Everyday sunglasses: RM220-RM380", "Cermin mata hitam harian: RM220-RM380", "日常太阳镜：RM220-RM380"),
                    tr(lang, "Polarized and premium styles: RM380-RM720", "Gaya polarized dan premium: RM380-RM720", "偏光与高级款：RM380-RM720"),
                    tr(lang, "Luxury collections: RM720-RM1,450+", "Koleksi mewah: RM720-RM1,450+", "奢华系列：RM720-RM1,450+"),
                ],
                "note": tr(lang, "Pricing varies by lens tint, frame material, and brand collection.", "Harga berbeza ikut tint kanta, bahan bingkai, dan koleksi jenama.", "价格会因镜片颜色、镜框材质和品牌系列而不同。"),
                "buttons": [
                    {"title": tr(lang, "Browse Sunglasses", "Lihat Cermin Mata Hitam", "浏览太阳镜"), "payload": '/select_product_type{"product_type":"Luxury Sunglasses"}'},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Luxury Sunglasses"}'},
                ],
            },
            "Lens Consultation": {
                "headline": tr(lang, "Lens Pricing", "Harga Kanta", "镜片价格"),
                "lines": [
                    tr(lang, "Single vision lens upgrades: RM120-RM260", "Naik taraf kanta single vision: RM120-RM260", "单光镜片升级：RM120-RM260"),
                    tr(lang, "Blue light and digital comfort options: RM260-RM520", "Pilihan blue light dan keselesaan digital: RM260-RM520", "防蓝光与数码舒适方案：RM260-RM520"),
                    tr(lang, "Progressive and premium lens packages: RM520-RM1,180+", "Pakej kanta progresif dan premium: RM520-RM1,180+", "渐进与高级镜片方案：RM520-RM1,180+"),
                ],
                "note": tr(lang, "Lens pricing depends on prescription complexity, coating, and package selection.", "Harga kanta bergantung pada kerumitan preskripsi, salutan, dan pilihan pakej.", "镜片价格取决于处方复杂度、镀膜和套餐选择。"),
                "buttons": [
                    {"title": tr(lang, "Lens Options", "Pilihan Kanta", "镜片方案"), "payload": "/lens_vision_solutions"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
                ],
            },
        }

        pricing_info = pricing_map.get(preferred_service, pricing_map["Designer Frames"])
        text = "\n\n".join([pricing_info["headline"], *pricing_info["lines"], pricing_info["note"]])
        dispatcher.utter_message(text=text, buttons=pricing_info["buttons"])
        return events


class ActionRecommendProducts(Action):
    def name(self) -> Text:
        return "action_recommend_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            switch = detect_domain_switch(tracker, intent["name"], raw_text, support_intent)
            reset_events: List[Dict[Text, Any]] = []
            if switch["detected"]:
                reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]
        
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, support_intent))
        events.extend(flow_entry_events(tracker, "product_recommendation"))
        lang = get_language(tracker)
        
        search_events, success = search_products_engine(raw_text, tracker, lang, intent["name"], dispatcher)
        events.extend(search_events)
        
        return events


class ActionSearchProductByAttribute(Action):
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        return ActionSmartSearch().run(dispatcher, tracker, domain)


class ActionFilterLenses(Action):
    def name(self) -> Text:
        return "action_filter_lenses"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "lens_consultation"))
        lang = get_language(tracker)
        lens_type = tracker.get_slot("lens_type")
        price_range = tracker.get_slot("price_range")

        df = load_catalogue().copy()
        mask = (
            df["category"].astype(str).str.contains("Lens", case=False, na=False)
            | df["product_type"].astype(str).str.contains("Lens", case=False, na=False)
            | df["category"].astype(str).str.contains("Contact", case=False, na=False)
        )
        if lens_type:
            needle = str(lens_type).lower().replace(" lenses", "").replace(" protection", "").strip()
            mask = mask & (
                df["lens_type"].astype(str).str.contains(needle, case=False, na=False)
                | df["lens_feature"].astype(str).str.contains(needle, case=False, na=False)
                | df["product_name"].astype(str).str.contains(needle, case=False, na=False)
                | df["description"].astype(str).str.contains(needle, case=False, na=False)
            )
        results = filter_by_budget(df[mask], price_range).head(5)

        if results.empty:
            dispatcher.utter_message(text=tr(lang, "We could not find any lenses matching your criteria.", "Kami tidak menemui kanta yang sepadan dengan kriteria anda.", "我们找不到符合您条件的镜片。"))
            return events

        for _, row in results.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(lens_type or "Lens Consultation"), lang)
        return events


class ActionAskBrand(Action):
    def name(self) -> Text:
        return "action_ask_brand"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        events = flow_entry_events(tracker, "browse_eyewear")
        lang = get_language(tracker)
        product_type = tracker.get_slot("product_type")

        df = load_catalogue().copy()
        if product_type:
            df = df[df["product_type"].astype(str).str.contains(str(product_type), case=False, na=False)]
        brands = sorted(
            {str(brand).strip() for brand in df["brand"].tolist() if str(brand).strip()},
            key=str.lower,
        )[:4]

        buttons = [
            {"title": brand.title(), "payload": f'/select_brand{{"brand":"{brand}"}}'}
            for brand in brands
        ]
        buttons.append({"title": "Show All Brands", "payload": '/select_brand{"brand":"Show All Brands"}'})

        if product_type and "contact" in str(product_type).lower():
            text = tr(lang, "Which brand of contact lenses would you like to explore?", "Jenama kanta sentuh mana yang anda mahu lihat?", "您想看哪个品牌的隐形眼镜？")
        elif product_type and "sunglasses" in str(product_type).lower():
            text = tr(lang, "What brand of sunglasses are you interested in?", "Jenama cermin mata hitam mana yang anda minati?", "您对哪个太阳镜品牌感兴趣？")
        else:
            text = tr(lang, "Which brand would you like to explore?", "Jenama mana yang anda mahu lihat?", "您想看哪个品牌？")

        dispatcher.utter_message(text=text, buttons=buttons)
        return events


class ActionQualifyLead(Action):
    def name(self) -> Text:
        return "action_qualify_lead"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lead_location = str(tracker.get_slot("lead_location") or "").strip()
        preferred_service = str(tracker.get_slot("preferred_service") or tracker.get_slot("product_type") or "").strip()
        email = str(tracker.get_slot("email") or "").strip()
        contact_number = str(tracker.get_slot("contact_number") or "").strip()
        purchase_timeline = str(tracker.get_slot("purchase_timeline") or "").strip().lower()

        known_cities = {city.lower() for city in unique_cities(load_catalogue())}
        location_match = any(city in lead_location.lower() for city in known_cities) if lead_location else False

        if lead_location and not location_match:
            status = "needs_review"
        elif email and contact_number and preferred_service and purchase_timeline in {"this week", "within 2 weeks"}:
            status = "qualified"
        else:
            status = "needs_review"

        return [SlotSet("lead_status", status)]


class ActionSubmitLeadCapture(Action):
    def name(self) -> Text:
        return "action_submit_lead_capture"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        payload = {
            "name": tracker.get_slot("lead_name"),
            "phone": tracker.get_slot("contact_number"),
            "email": tracker.get_slot("email"),
            "location": tracker.get_slot("lead_location"),
            "preferred_service": tracker.get_slot("preferred_service") or tracker.get_slot("product_type"),
            "purchase_timeline": tracker.get_slot("purchase_timeline"),
            "order_id": tracker.get_slot("order_id"),
            "use_case": tracker.get_slot("use_case"),
            "urgency": tracker.get_slot("urgency"),
            "lead_status": tracker.get_slot("lead_status"),
            "latest_intent": tracker.latest_message.get("intent", {}).get("name"),
        }

        response = gateway.submit_lead(payload)
        status = tracker.get_slot("lead_status")
        preferred_service = str(payload.get("preferred_service") or "").strip()
        current_flow = str(tracker.get_slot("current_flow") or "").strip()
        latest_intent = str(payload.get("latest_intent") or "").strip()

        if status == "qualified":
            booking_line = tr(
                lang,
                f"\nYou can also book directly here: {BOOKING_URL}" if BOOKING_URL else "",
                f"\nAnda juga boleh tempah terus di sini: {BOOKING_URL}" if BOOKING_URL else "",
                f"\n您也可以直接在这里预约：{BOOKING_URL}" if BOOKING_URL else "",
            )
            _qualified_en = random.choice([
                f"You're all set. Our team will confirm your appointment and share all the details shortly.{booking_line}",
                f"Your details are confirmed. Expect a personal follow-up from our team very soon.{booking_line}",
                f"All set. A Calisto specialist will be in touch to finalise everything for you.{booking_line}",
                f"Noted and confirmed. Our team will reach out shortly with your next steps.{booking_line}",
                f"Your request is locked in. Someone from our team will be in touch shortly to arrange everything.{booking_line}",
            ])
            dispatcher.utter_message(
                text=tr(
                    lang,
                    _qualified_en,
                    f"Terima kasih. Pasukan kami akan hubungi anda tidak lama lagi untuk mengesahkan temujanji anda.{booking_line}",
                    f"一切就绪。我们的团队将很快联系您，确认您的预约详情。{booking_line}"
                ),
                buttons=[
                    {"title": tr(lang, "Book Appointment", "Tempah Janji Temu", "预约"), "payload": "/book_appointment"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                ],
            )
        else:
            _en_text = _pick_completion_response(preferred_service, current_flow, latest_intent)
            _ms_text = tr(
                "ms",
                _en_text,
                random.choice([
                    "Permintaan anda telah diterima. Pasukan kami akan menghubungi anda tidak lama lagi.",
                    "Maklumat anda telah dicatat. Pasukan kami akan menghubungi anda dengan segera.",
                    "Terima kasih. Kami akan berikan maklum balas kepada anda tidak lama lagi.",
                    "Dicatat. Pasukan kami akan berhubung dengan anda tidak lama lagi.",
                    "Permohonan anda telah kami terima. Kami akan menghubungi anda dengan segera.",
                ]),
                "",
            )
            _zh_text = tr(
                "zh",
                _en_text,
                "",
                random.choice([
                    "您的请求已收到。我们的团队将尽快与您联系。",
                    "已记录您的信息。我们的团队将尽快跟进。",
                    "感谢您。我们会尽快回复您。",
                    "已收到。我们的团队很快会与您联系。",
                    "您的申请已提交。专员将尽快与您联系。",
                ]),
            )
            dispatcher.utter_message(
                text=tr(lang, _en_text, _ms_text, _zh_text),
                buttons=[
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                    {"title": tr(lang, "Ask Another Question", "Tanya Soalan Lain", "再问一个问题"), "payload": "/greet"},
                ],
            )

        if response and response.get("lead_id"):
            dispatcher.utter_message(text=tr(lang, f"Reference ID: {response['lead_id']}", f"ID Rujukan: {response['lead_id']}", f"参考编号：{response['lead_id']}"))
        return [SlotSet("current_flow", None), SlotSet("requested_slot", None)]


class ActionHandleReturnSupport(Action):
    def name(self) -> Text:
        return "action_handle_return_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "return_request")


class ActionHandleRefundSupport(Action):
    def name(self) -> Text:
        return "action_handle_refund_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "refund_request")


class ActionHandleRepairSupport(Action):
    def name(self) -> Text:
        return "action_handle_repair_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "repair_support")


class ActionHandleExchangeSupport(Action):
    def name(self) -> Text:
        return "action_handle_exchange_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "exchange_request")


class ActionHandleWarrantySupport(Action):
    def name(self) -> Text:
        return "action_handle_warranty_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "warranty_support")


class ActionHandleOrderSupport(Action):
    def name(self) -> Text:
        return "action_handle_order_support"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        return route_support_flow(dispatcher, tracker, "order_support")
class ActionBookAppointment(Action):
    def name(self) -> Text:
        return "action_book_appointment"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        
        # Try to fetch booking instructions
        try:
            faq_entries = load_kb_metadata()
            best_result = None
            for entry in faq_entries:
                text = str(entry.get("text") or "").strip().lower()
                if "book an eye test online" in text or "booking" in text:
                    best_result = entry
                    break
                    
            if best_result:
                answer = best_result.get("text", "").strip()
                if " A:" in answer:
                    answer = answer.split(" A:", 1)[1].strip()
                if " Q:" in answer:
                    answer = answer.split(" Q:", 1)[0].strip()
                dispatcher.utter_message(text=f"📄 {answer}")
            else:
                dispatcher.utter_message(
                    text=tr(
                        lang,
                        "You can easily book an appointment through our website or by visiting a store.",
                        "Anda boleh menempah janji temu melalui laman web kami atau di kedai fizikal.",
                        "您可以通过我们的网站或前往门店轻松预约。"
                    )
                )
        except Exception as e:
            logger.error(f"Failed to fetch booking policy: {e}")
            dispatcher.utter_message(text="You can book an appointment directly on our website.")
            
        # Instead of triggering a lead form, give them options
        dispatcher.utter_message(
            text=tr(
                lang,
                "What would you like to do next?",
                "Apakah langkah seterusnya yang anda mahu ambil?",
                "您想接下来怎么继续？"
            ),
            buttons=[
                {"title": "Find Nearest Store", "payload": "/find_a_store"},
                {"title": "Ask a Question", "payload": "/ask_a_question"},
                {"title": "Support & Policies", "payload": "/support_and_policies"}
            ]
        )
        return []
