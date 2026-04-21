import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from typing import Any, Dict, List, Optional, Text

import pandas as pd
from rasa_sdk import Action, Tracker
from rasa_sdk.events import ActiveLoop, FollowupAction, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.forms import FormValidationAction

from actions.knowledge_base.hybrid_retriever import hybrid_search
from actions.knowledge_base.indexer import KnowledgeSearcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CATALOGUE_PATH = os.getenv(
    "KB_CATALOGUE_PATH",
    "knowledge_base/calisto_product_catalog_500.csv",
)
BOOKING_URL = os.getenv("BOOKING_URL", "https://calisto.example.com/book")
KB_INDEX_META_PATH = os.getenv(
    "KB_INDEX_META_PATH",
    "knowledge_base/index/calisto_meta.json",
)
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


class ServiceGateway:
    """Thin backend adapter with CSV fallback for local development."""

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

    def _request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
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
                return json.loads(body) if body else {}
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("Backend request to %s failed: %s", url, exc)
            return None

    def search_products(self, filters: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        response = self._request("POST", "/products/search", filters)
        if not response:
            return None
        products = response.get("products")
        return products if isinstance(products, list) else None

    def search_stores(self, location: str) -> Optional[List[Dict[str, Any]]]:
        response = self._request("POST", "/stores/search", {"location": location})
        if not response:
            return None
        stores = response.get("stores")
        return stores if isinstance(stores, list) else None

    def submit_lead(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return self._request("POST", "/leads", payload)


gateway = ServiceGateway()


@lru_cache(maxsize=1)
def load_catalogue() -> pd.DataFrame:
    df = pd.read_csv(CATALOGUE_PATH).fillna("")
    if "price_myr" in df.columns:
        df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")
    return df


@lru_cache(maxsize=1)
def load_kb_metadata() -> List[Dict[str, Any]]:
    if not os.path.exists(KB_INDEX_META_PATH):
        return []

    with open(KB_INDEX_META_PATH, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def filter_by_budget(df: pd.DataFrame, budget_slot: Text) -> pd.DataFrame:
    if not budget_slot:
        return df

    budget_text = str(budget_slot).strip()
    budget_lower = budget_text.lower().replace(" ", "").replace("–", "-")
    if "underrm100" in budget_lower:
        return df[df["price_myr"] < 100]
    if "rm100-rm250" in budget_lower:
        return df[(df["price_myr"] >= 100) & (df["price_myr"] <= 250)]
    if "rm250-rm300" in budget_lower:
        return df[(df["price_myr"] >= 250) & (df["price_myr"] <= 300)]
    if "aboverm300" in budget_lower:
        return df[df["price_myr"] > 300]

    match_under = re.search(r"(?:under|below|lessthan)\s*(?:rm)?\s*(\d+(?:\.\d+)?)", budget_lower)
    if match_under:
        return df[df["price_myr"] <= float(match_under.group(1))]

    match_over = re.search(r"(?:over|above|morethan)\s*(?:rm)?\s*(\d+(?:\.\d+)?)", budget_lower)
    if match_over:
        return df[df["price_myr"] >= float(match_over.group(1))]

    match_range = re.search(r"(?:between|from)?\s*(?:rm)?\s*(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*(?:rm)?\s*(\d+(?:\.\d+)?)", budget_lower)
    if match_range:
        low = float(match_range.group(1))
        high = float(match_range.group(2))
        return df[(df["price_myr"] >= low) & (df["price_myr"] <= high)]

    match_around = re.search(r"(?:around|about|approx(?:imately)?)\s*(?:rm)?\s*(\d+(?:\.\d+)?)", budget_lower)
    if match_around:
        center = float(match_around.group(1))
        return df[(df["price_myr"] >= center - 50) & (df["price_myr"] <= center + 50)]

    match_numeric = re.search(r"\b(\d+(?:\.\d+)?)\b", budget_text)
    if match_numeric:
        value = float(match_numeric.group(1))
        return df[df["price_myr"] <= value]

    return df


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
        f"https://dummyimage.com/1200x628/{config['bg']}/{config['fg']}"
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
        {"title": tr(lang, "Consult Now", "Hubungi Konsultan", "联系顾问"), "payload": payload},
    ]


def emit_product_card(dispatcher: CollectingDispatcher, product: Dict[str, Any], preferred_service: Optional[str], lang: str = "en") -> None:
    brand = str(product.get("brand") or "Brand").strip()
    name = str(product.get("product_name") or "Product").strip()
    price = float(product.get("price_myr", 0) or 0)
    product_type = str(product.get("product_type") or product.get("category") or "").strip()
    material = titleize(product.get("frame_material"))
    shape = titleize(product.get("frame_shape"))
    color = titleize(product.get("frame_color"))
    stock = str(product.get("stock_status") or "").replace("_", " ").title()
    rating = product.get("rating")
    store_location = str(product.get("store_location") or "").strip()
    city = str(product.get("city") or "").strip()

    detail_parts = [part for part in [material, shape, color] if part]
    subtitle_sections = [
        tr(lang, f"Price: RM{price:.2f}", f"Harga: RM{price:.2f}", f"价格：RM{price:.2f}"),
        tr(lang, f"Category: {product_type}", f"Kategori: {product_type}", f"类别：{product_type}") if product_type else "",
        tr(lang, f"Specs: {' • '.join(detail_parts)}", f"Spesifikasi: {' • '.join(detail_parts)}", f"规格：{' • '.join(detail_parts)}") if detail_parts else "",
        tr(lang, f"Availability: {stock}", f"Ketersediaan: {stock}", f"库存：{stock}") if stock else "",
        tr(lang, f"Rating: {rating}/5", f"Penilaian: {rating}/5", f"评分：{rating}/5") if rating not in (None, "") else "",
        tr(lang, f"Store: {store_location}, {city}".strip(", "), f"Kedai: {store_location}, {city}".strip(", "), f"门店：{store_location}, {city}".strip(", ")) if (store_location or city) else "",
    ]

    actions = []
    if store_location or city:
        actions.append({
            "type": "url",
            "title": tr(lang, "Open Store Map", "Buka Peta Kedai", "打开门店地图"),
            "value": build_maps_url(store_location, city, "Calisto Eyewear"),
        })
    actions.append({"type": "postback", "title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "value": "/book_appointment"})
    actions.append({
        "type": "postback",
        "title": tr(lang, "Consult Now", "Hubungi Konsultan", "联系顾问"),
        "value": lead_buttons(lang, preferred_service)[-1]["payload"],
    })

    theme = choose_product_image_theme(product_type, preferred_service)

    dispatcher.utter_message(
        json_message={
            "type": "card",
            "title": f"{brand} - {name}",
            "subtitle": "\n\n".join(line for line in subtitle_sections if line),
            "imageUrl": build_placeholder_image(f"{brand} {name}", theme),
            "actions": actions,
        }
    )


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


def latest_message_text(tracker: Tracker) -> str:
    metadata = latest_metadata(tracker)
    original_text = metadata.get("originalText") or metadata.get("original_text")
    preferred_text = original_text if isinstance(original_text, str) and original_text.strip() else tracker.latest_message.get("text")
    return normalize_free_text(preferred_text or "")


def clean_retrieved_answer(text: str) -> str:
    answer = " ".join(text.split()).strip()
    if " A:" in answer:
        answer = answer.split(" A:", 1)[1].strip()
    if " Q:" in answer:
        answer = answer.split(" Q:", 1)[0].strip()
    return answer


def infer_service_from_intent(tracker: Tracker) -> str:
    intent_name = str(tracker.latest_message.get("intent", {}).get("name") or "").strip()
    service_map = {
        "book_appointment": "Appointment Booking",
        "reschedule_appointment": "Appointment Reschedule",
        "after_sales_support": "After-sales Support",
        "order_tracking": "Order Tracking",
        "warranty_claim": "Warranty Support",
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
        "just exploring": "Just Exploring",
    }
    if normalized in allowed:
        return allowed[normalized]
    if "this week" in normalized:
        return "This Week"
    if "2 week" in normalized or "two week" in normalized:
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

    return detect_language_from_text(latest_message_text(tracker))


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
        detected = detect_language_from_text(latest_message_text(tracker))
        language = detected or (current if current in {"en", "ms", "zh"} else "en")
        return [SlotSet("preferred_language", language)]


class ActionDocumentSearch(Action):
    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        query = latest_message_text(tracker)
        if not query:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Could you rephrase your question so I can search the knowledge base?",
                    "Boleh anda tulis semula soalan anda supaya saya boleh semak pangkalan pengetahuan?",
                    "请换一种说法提问，我才能查询知识库。",
                )
            )
            return []

        intent = tracker.latest_message.get("intent") or {}
        entities = tracker.latest_message.get("entities") or []
        entity_map: Dict[str, List[str]] = {}
        for entity in entities:
            entity_name = entity.get("entity")
            entity_value = entity.get("value")
            if entity_name and entity_value is not None:
                entity_map.setdefault(entity_name, []).append(str(entity_value))

        try:
            searcher = KnowledgeSearcher.get()
            results = hybrid_search(
                query=query,
                searcher=searcher,
                bm25=searcher.bm25,
                entities=entity_map,
                intent_name=str(intent.get("name") or "").strip() or None,
                intent_confidence=float(intent.get("confidence") or 0.0),
            )
        except Exception as exc:
            logger.exception("Knowledge-base retrieval failed: %s", exc)
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "The knowledge search is temporarily unavailable. Please try again shortly.",
                    "Carian pengetahuan tidak tersedia buat sementara waktu. Sila cuba sebentar lagi.",
                    "知识检索暂时不可用，请稍后再试。",
                )
            )
            return []

        if results:
            answer = clean_retrieved_answer(str(results[0].get("text") or "").strip())
            words = answer.split()
            if len(words) > 150:
                answer = " ".join(words[:150]) + " ..."

            dispatcher.utter_message(text=answer)
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "If you need help with a return, exchange, or support follow-up, I can connect you with the team.",
                    "Jika anda perlukan bantuan untuk pemulangan, pertukaran, atau susulan sokongan, saya boleh hubungkan anda dengan pasukan kami.",
                    "如果您需要退货、换货或售后协助，我可以帮您联系团队。"
                ),
                buttons=[
                    {"title": tr(lang, "After-sales Support", "Sokongan Selepas Jualan", "售后支持"), "payload": "/after_sales_support"},
                    {"title": tr(lang, "Warranty Help", "Bantuan Waranti", "保修协助"), "payload": "/warranty_claim"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                ],
            )
            return []

        dispatcher.utter_message(
            text=tr(
                lang,
                "I can help with returns, warranty, store info, or booking questions. Tell me which one you need.",
                "Saya boleh bantu dengan pemulangan, waranti, info kedai, atau tempahan. Beritahu saya yang mana anda perlukan.",
                "我可以协助退货、保修、门店信息或预约问题。请告诉我您需要哪一项。"
            ),
            buttons=[
                {"title": tr(lang, "Refund Policy", "Polisi Refund", "退款政策"), "payload": "/ask_faq"},
                {"title": tr(lang, "Warranty", "Waranti", "保修"), "payload": "/warranty_claim"},
                {"title": tr(lang, "Book Eye Test", "Tempah Ujian Mata", "预约验光"), "payload": "/book_appointment"},
            ],
        )
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
        events: List[Dict[Text, Any]] = []

        slot_mappings = {
            "lead_name": metadata.get("senderName"),
            "contact_number": metadata.get("phone"),
            "email": metadata.get("email"),
            "lead_location": metadata.get("location"),
            "preferred_service": metadata.get("preferred_service") or infer_service_from_intent(tracker),
        }

        for slot_name, value in slot_mappings.items():
            if tracker.get_slot(slot_name):
                continue
            normalized = str(value).strip() if isinstance(value, str) else ""
            if normalized:
                events.append(SlotSet(slot_name, normalized))

        events.append(SlotSet("current_flow", "lead_capture"))
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
                "current_flow": FLOW_BY_INTENT.get(intent["name"], "interrupted"),
            }

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
        if not is_valid_location(value):
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

        if intent_name not in FORM_INTERRUPTION_INTENTS or intent["confidence"] < INTENT_CONFIDENCE_THRESHOLD:
            dispatcher.utter_message(text=tr(lang, "I still need that detail to continue.", "Saya masih perlukan butiran itu untuk teruskan.", "我还需要这项信息才能继续。"))
            if requested_slot:
                dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
            return []

        events: List[Dict[Text, Any]] = [
            SlotSet("requested_slot", None),
            ActiveLoop(None),
            SlotSet("current_flow", FLOW_BY_INTENT.get(intent_name, "interrupted")),
        ]

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
        elif intent_name in {"select_brand", "select_budget"}:
            events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "ask_faq":
            events.append(FollowupAction("action_document_search"))
        else:
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
        return [
            SlotSet("product_type", None),
            SlotSet("brand", None),
            SlotSet("price_range", None),
            SlotSet("frame_shape", None),
            SlotSet("frame_color", None),
            SlotSet("frame_material", None),
            SlotSet("lens_type", None),
            SlotSet("city", None),
        ]


class ActionFilterProducts(Action):
    def name(self) -> Text:
        return "action_filter_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        entities = latest_entity_values(tracker)
        product_type = entities.get("product_type") or tracker.get_slot("product_type")
        brand = entities.get("brand") or tracker.get_slot("brand")
        price_range = (
            entities.get("price_range")
            or entities.get("budget")
            or tracker.get_slot("price_range")
            or tracker.get_slot("budget")
        )
        frame_color = entities.get("frame_color") or tracker.get_slot("frame_color")
        frame_shape = entities.get("frame_shape") or tracker.get_slot("frame_shape")
        frame_material = entities.get("frame_material") or tracker.get_slot("frame_material")

        backend_results = gateway.search_products({
            "product_type": product_type,
            "brand": brand,
            "price_range": price_range,
            "frame_color": frame_color,
            "frame_shape": frame_shape,
            "frame_material": frame_material,
        })
        if backend_results:
            dispatcher.utter_message(text=tr(lang, "Here are some products that match your request:", "Berikut ialah beberapa produk yang sepadan dengan permintaan anda:", "以下是一些符合您需求的产品："))
            for product in backend_results[:4]:
                emit_product_card(dispatcher, product, str(product_type or brand or ""), lang)
            return []

        filtered_df = load_catalogue().copy()
        if product_type and str(product_type).lower() != "contact lenses":
            filtered_df = filtered_df[
                filtered_df["product_type"].astype(str).str.contains(product_type, case=False, na=False)
            ]
        if brand and str(brand).lower() != "show all brands":
            filtered_df = filtered_df[
                filtered_df["brand"].astype(str).str.contains(brand, case=False, na=False)
            ]
        if frame_color:
            filtered_df = filtered_df[
                filtered_df["frame_color"].astype(str).str.contains(str(frame_color), case=False, na=False)
            ]
        if frame_shape:
            filtered_df = filtered_df[
                filtered_df["frame_shape"].astype(str).str.contains(str(frame_shape), case=False, na=False)
            ]
        if frame_material:
            filtered_df = filtered_df[
                filtered_df["frame_material"].astype(str).str.contains(str(frame_material), case=False, na=False)
            ]
        filtered_df = filter_by_budget(filtered_df, price_range)
        top_5 = filtered_df.head(5)

        if top_5.empty:
            dispatcher.utter_message(
                text=tr(lang, "We could not find eyewear matching your criteria. Try another brand or budget.", "Kami tidak menemui produk yang sepadan dengan kriteria anda. Cuba jenama atau bajet lain.", "我们暂时找不到符合您条件的产品。请尝试其他品牌或预算。")
            )
            return []

        dispatcher.utter_message(text=tr(lang, "Here are some products that match your request:", "Berikut ialah beberapa produk yang sepadan dengan permintaan anda:", "以下是一些符合您需求的产品："))
        for _, row in top_5.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(product_type or brand or ""), lang)
        return []


class ActionExplainLens(Action):
    def name(self) -> Text:
        return "action_explain_lens"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
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
                {"title": tr(lang, "Talk to Consultant", "Bercakap Dengan Konsultan", "联系顾问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
            ],
        )
        return []


class ActionAskCity(Action):
    def name(self) -> Text:
        return "action_ask_city"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        resolved_city = tracker.get_slot("city") or tracker.get_slot("lead_location")
        if resolved_city:
            city = str(resolved_city)
            backend_stores = gateway.search_stores(city)
            if backend_stores:
                for store in backend_stores[:6]:
                    emit_store_card(
                        dispatcher,
                        str(store.get("store_location", "Calisto Store")),
                        str(store.get("city", city)),
                        lang,
                    )
                return [SlotSet("city", city)]

            stores = search_store_rows(load_catalogue(), city)
            if stores.empty:
                dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
                return [SlotSet("city", city)]

            for _, row in stores.head(6).iterrows():
                emit_store_card(
                    dispatcher,
                    str(row.get("store_location", "Calisto Store")),
                    str(row.get("city", city)),
                    lang,
                )
            return [SlotSet("city", city)]

        cities = unique_cities(load_catalogue())
        buttons = [
            {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
            for city in cities[:10]
        ]
        dispatcher.utter_message(text=tr(lang, "Which city are you looking for?", "Bandar mana yang anda cari?", "您想查哪个城市？"), buttons=buttons or None)
        return []


class ActionFindStore(Action):
    def name(self) -> Text:
        return "action_find_store"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        city = tracker.get_slot("city") or tracker.get_slot("lead_location")
        if not city:
            dispatcher.utter_message(text=tr(lang, "Please specify the city to find a store.", "Sila nyatakan bandar untuk mencari kedai.", "请提供要查询的城市。"))
            return []

        backend_stores = gateway.search_stores(str(city))
        if backend_stores:
            for store in backend_stores[:6]:
                emit_store_card(
                    dispatcher,
                    str(store.get('store_location', 'Calisto Store')),
                    str(store.get('city', city)),
                    lang,
                )
            return []

        stores = search_store_rows(load_catalogue(), str(city))
        if stores.empty:
            dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
            return []

        for _, row in stores.head(6).iterrows():
            emit_store_card(
                dispatcher,
                str(row.get('store_location', 'Calisto Store')),
                str(row.get('city', city)),
                lang,
            )
        return []


class ActionHandleStoreHours(Action):
    def name(self) -> Text:
        return "action_handle_store_hours"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        city = tracker.get_slot("city") or tracker.get_slot("lead_location")
        if city:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    f"Most Calisto stores in {titleize(str(city))} typically follow mall operating hours, usually around 10:00 AM to 10:00 PM daily. I recommend confirming before visiting.",
                    f"Kebanyakan kedai Calisto di {titleize(str(city))} biasanya mengikut waktu operasi pusat beli-belah, sekitar 10:00 pagi hingga 10:00 malam setiap hari. Saya syorkan anda sahkan dahulu sebelum datang.",
                    f"{titleize(str(city))} 的大多数 Calisto 门店通常跟随商场营业时间，一般为每天上午 10:00 至晚上 10:00。建议您到店前先确认。"
                ),
                buttons=[
                    {"title": tr(lang, "Show Stores", "Lihat Kedai", "查看门店"), "payload": f'/choose_city{{"city":"{city}"}}'},
                    {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
                ],
            )
            return []

        dispatcher.utter_message(
            text=tr(lang, "Most Calisto stores typically follow mall operating hours, usually around 10:00 AM to 10:00 PM daily. If you tell me the city or mall, I can point you to the right location.", "Kebanyakan kedai Calisto biasanya mengikut waktu operasi pusat beli-belah, sekitar 10:00 pagi hingga 10:00 malam setiap hari. Jika anda beritahu bandar atau pusat beli-belah, saya boleh tunjuk lokasi yang sesuai.", "大多数 Calisto 门店通常跟随商场营业时间，一般为每天上午 10:00 至晚上 10:00。如果您告诉我城市或商场，我可以为您找到对应门店。"),
            buttons=[
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
            ],
        )
        return []


class ActionShowPricing(Action):
    def name(self) -> Text:
        return "action_show_pricing"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        preferred_service = str(tracker.get_slot("preferred_service") or "").strip() or "Designer Frames"

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
                    {"title": tr(lang, "Talk to Consultant", "Bercakap Dengan Konsultan", "联系顾问"), "payload": '/capture_lead{"preferred_service":"Designer Frames"}'},
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
                    {"title": tr(lang, "Talk to Consultant", "Bercakap Dengan Konsultan", "联系顾问"), "payload": '/capture_lead{"preferred_service":"Luxury Sunglasses"}'},
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
                    {"title": tr(lang, "Talk to Consultant", "Bercakap Dengan Konsultan", "联系顾问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
                ],
            },
        }

        pricing_info = pricing_map.get(preferred_service, pricing_map["Designer Frames"])
        text = "\n\n".join([pricing_info["headline"], *pricing_info["lines"], pricing_info["note"]])
        dispatcher.utter_message(text=text, buttons=pricing_info["buttons"])
        return []


class ActionRecommendProducts(Action):
    def name(self) -> Text:
        return "action_recommend_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        entities = latest_entity_values(tracker)
        use_case = entities.get("use_case") or tracker.get_slot("use_case")
        budget = entities.get("budget") or tracker.get_slot("budget") or tracker.get_slot("price_range")
        brand = entities.get("brand") or tracker.get_slot("brand")
        requested_type = entities.get("product_type") or tracker.get_slot("product_type")

        inferred_type = requested_type or infer_product_type_from_use_case(str(use_case or ""))
        filtered_df = load_catalogue().copy()

        if inferred_type:
            filtered_df = filtered_df[
                filtered_df["product_type"].astype(str).str.contains(str(inferred_type), case=False, na=False)
            ]
        if brand:
            filtered_df = filtered_df[
                filtered_df["brand"].astype(str).str.contains(str(brand), case=False, na=False)
            ]
        if use_case:
            use_case_text = str(use_case)
            mask = (
                filtered_df["description"].astype(str).str.contains(use_case_text, case=False, na=False)
                | filtered_df["product_name"].astype(str).str.contains(use_case_text, case=False, na=False)
                | filtered_df["lens_feature"].astype(str).str.contains(use_case_text, case=False, na=False)
            )
            if not filtered_df[mask].empty:
                filtered_df = filtered_df[mask]

        filtered_df = filter_by_budget(filtered_df, budget)
        results = filtered_df.head(4)

        if results.empty:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I could not find a strong match yet. Tell me your preferred product type, budget, or use case such as office use, driving, daily wear, or fashion.",
                    "Saya belum menemui padanan yang kuat. Beritahu saya jenis produk, bajet, atau kegunaan anda seperti untuk pejabat, memandu, kegunaan harian, atau fesyen.",
                    "我暂时还没找到很合适的推荐。请告诉我您偏好的产品类型、预算，或使用场景，例如上班、驾驶、日常佩戴或时尚用途。"
                ),
                buttons=[
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                    {"title": tr(lang, "Check Pricing", "Semak Harga", "查看价格"), "payload": "/ask_pricing"},
                    {"title": tr(lang, "Talk to Consultant", "Bercakap Dengan Konsultan", "联系顾问"), "payload": '/capture_lead{"preferred_service":"Eyewear Recommendation"}'},
                ],
            )
            return []

        intro_bits = []
        if inferred_type:
            intro_bits.append(str(inferred_type))
        if use_case:
            intro_bits.append(f"for {str(use_case).strip()}")
        if budget:
            intro_bits.append(f"within {str(budget).strip()}")
        intro_text = " ".join(intro_bits).strip()
        if intro_text:
            dispatcher.utter_message(text=tr(lang, f"Here are a few recommendations {intro_text}:", f"Berikut beberapa cadangan {intro_text}:", f"以下是一些{intro_text}推荐："))
        else:
            dispatcher.utter_message(text=tr(lang, "Here are a few product recommendations for you:", "Berikut beberapa cadangan produk untuk anda:", "以下是为您推荐的几款产品："))

        for _, row in results.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(inferred_type or "Eyewear Recommendation"), lang)

        return [SlotSet("product_type", inferred_type)] if inferred_type else []


class ActionSearchProductByAttribute(Action):
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        frame_color = tracker.get_slot("frame_color")
        frame_shape = tracker.get_slot("frame_shape")
        frame_material = tracker.get_slot("frame_material")
        user_message = (tracker.latest_message.get("text") or "").lower()

        filtered_df = load_catalogue().copy()
        if frame_color:
            filtered_df = filtered_df[
                filtered_df["frame_color"].astype(str).str.contains(frame_color, case=False, na=False)
            ]
        if frame_shape:
            filtered_df = filtered_df[
                filtered_df["frame_shape"].astype(str).str.contains(frame_shape, case=False, na=False)
            ]
        if frame_material:
            filtered_df = filtered_df[
                filtered_df["frame_material"].astype(str).str.contains(frame_material, case=False, na=False)
            ]

        if not frame_color and not frame_shape and not frame_material and len(user_message) > 3:
            for part in user_message.split():
                if len(part) <= 3:
                    continue
                mask = (
                    filtered_df["frame_color"].astype(str).str.contains(part, case=False, na=False)
                    | filtered_df["frame_shape"].astype(str).str.contains(part, case=False, na=False)
                    | filtered_df["frame_material"].astype(str).str.contains(part, case=False, na=False)
                    | filtered_df["description"].astype(str).str.contains(part, case=False, na=False)
                    | filtered_df["product_name"].astype(str).str.contains(part, case=False, na=False)
                )
                if not filtered_df[mask].empty:
                    filtered_df = filtered_df[mask]

        top_5 = filtered_df.head(5)
        if top_5.empty:
            dispatcher.utter_message(text=tr(lang, "I could not find products matching that description.", "Saya tidak menemui produk yang sepadan dengan penerangan itu.", "我找不到符合该描述的产品。"))
            return []

        for _, row in top_5.iterrows():
            emit_product_card(dispatcher, row.to_dict(), "Product Recommendation", lang)
        return []


class ActionFilterLenses(Action):
    def name(self) -> Text:
        return "action_filter_lenses"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
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
            return []

        for _, row in results.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(lens_type or "Lens Consultation"), lang)
        return []


class ActionAskBrand(Action):
    def name(self) -> Text:
        return "action_ask_brand"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
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
        return []


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
        if status == "qualified":
            dispatcher.utter_message(
                text=tr(
                    lang,
                    f"Thanks, your request is qualified and our team will follow up shortly.\nYou can also book directly here: {BOOKING_URL}",
                    f"Terima kasih, permintaan anda layak untuk susulan dan pasukan kami akan hubungi anda tidak lama lagi.\nAnda juga boleh tempah terus di sini: {BOOKING_URL}",
                    f"谢谢，您的请求已符合跟进条件，我们的团队会尽快联系您。\n您也可以直接在这里预约：{BOOKING_URL}"
                ),
                buttons=[
                    {"title": tr(lang, "Book Appointment", "Tempah Janji Temu", "预约"), "payload": "/book_appointment"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                ],
            )
        else:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Thank you. We have captured your inquiry and our team will review the best next step for you.",
                    "Terima kasih. Kami telah merekodkan pertanyaan anda dan pasukan kami akan semak langkah seterusnya yang paling sesuai untuk anda.",
                    "谢谢。我们已记录您的咨询，团队会为您评估最合适的下一步。"
                ),
                buttons=[
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                    {"title": tr(lang, "Ask Another Question", "Tanya Soalan Lain", "再问一个问题"), "payload": "/greet"},
                ],
            )

        if response and response.get("lead_id"):
            dispatcher.utter_message(text=tr(lang, f"Reference ID: {response['lead_id']}", f"ID Rujukan: {response['lead_id']}", f"参考编号：{response['lead_id']}"))
        return [SlotSet("current_flow", None), SlotSet("requested_slot", None)]
