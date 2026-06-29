import json
import logging
import os
import random
import re
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from difflib import get_close_matches
from functools import lru_cache
from typing import Any, Dict, List, Optional, Text
from collections import defaultdict

import pandas as pd
from rasa_sdk import Action, Tracker
from rasa_sdk.events import ActiveLoop, FollowupAction, SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.forms import FormValidationAction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from config.settings import (
    BOOKING_URL,
    DEFAULT_STORE_HOURS,
    INTENT_CONFIDENCE_THRESHOLD,
    FORM_INTERRUPTION_INTENTS,
    FLOW_BY_INTENT,
    PERSISTENT_SLOTS,
    MANAGED_SLOTS,
    FLOW_ALLOWED_SLOTS,
)
from config.constants import (
    PRODUCT_FIELD_ALIASES,
    CANONICAL_ALIASES,
    NORMALIZATION_MAP,
    SUPPORT_KEYWORDS,
    SUPPORT_INTENT_MAP,
    SUPPORT_INTENTS,
)
from config.regex_patterns import (
    BUDGET_KEYWORDS,
    CHEAP_KEYWORDS,
    PREMIUM_KEYWORDS,
    BEST_KEYWORDS,
)
from gateway.service_gateway import gateway


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


from nlp.city_resolver import (
    normalize_city_key,
    city_key_registry,
    resolve_city,
    is_probable_location
)








from search.catalogue import load_catalogue


def load_kb_metadata() -> List[Dict[str, Any]]:
    """Load knowledge chunks for FAQ routing from the remote DB via integration service."""
    if not gateway.enabled():
        raise RuntimeError(
            "BACKEND_API_BASE_URL is not set. Knowledge base is only available via the integration API (MySQL)."
        )
    remote: Any = gateway.get_json("/knowledge/chunks")
    if remote is None:
        raise RuntimeError(
            "Knowledge base unavailable from integration API. "
            "Ensure chatbot-integrations is running with STORAGE_BACKEND=mysql."
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


from nlp.budget_parser import parse_budget_from_text
from search.filters import filter_by_budget


from search.formatters import format_product, format_product_list, titleize

def latest_entity_values(tracker: Tracker) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    for entity in tracker.latest_message.get("entities", []):
        entity_name = entity.get("entity")
        if entity_name:
            values[entity_name] = entity.get("value")
    return values


from nlp.canonicalizer import (
    canonical_text_key,
    canonicalize_slot_value,
    canonicalize_entities
)






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

    # If ask_faq has high confidence, don't override with keyword matching
    # User is asking about a policy, not requesting support action
    if confidence >= 0.7 and intent_name == "ask_faq":
        return ("", "", False)

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
    lang = detect_language_from_text(tracker.latest_message.get("text") or "") or "en"
    
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

    # Policy context is now shown by the individual action handlers in support.py
    # (e.g. ActionHandleWarrantySupport, ActionHandleRefundSupport) BEFORE calling
    # route_support_flow.  Keeping KB lookups here mixed operational routing with
    # informational retrieval — that separation is now enforced at the action layer.

    # For support action intents (return_request, exchange_request, etc.) we ALWAYS
    # follow the policy display with lead capture so the support team can follow up.
    # The ask_faq path (action_document_search) is responsible for the buttons-only
    # flow where the user is just asking about policy without initiating an action.
    _support_intros = [
        f"Of course. I'll connect you with our support team for your {preferred_service.lower()} right away.",
        f"Understood. Let me get our support team on your {preferred_service.lower()}.",
        f"No problem. I'm routing your {preferred_service.lower()} to the right team now.",
        f"Got it. Our support team will take care of your {preferred_service.lower()} from here.",
        f"Noted. I'm passing your {preferred_service.lower()} to a specialist who can assist you.",
    ]
    dispatcher.utter_message(text=random.choice(_support_intros))

    # Collect already-provided information from current session
    existing_lead_name = tracker.get_slot("lead_name")
    existing_contact = tracker.get_slot("contact_number")
    existing_email = tracker.get_slot("email")
    existing_location = tracker.get_slot("lead_location")

    # Check what still needs to be collected
    needs_collection = []
    if not existing_lead_name or existing_lead_name == "skipped":
        needs_collection.append("name")
    if not existing_contact or existing_contact == "skipped":
        needs_collection.append("phone number")

    # Build contextual prompt based on what's missing
    if needs_collection:
        if existing_lead_name and existing_lead_name != "skipped":
            # Name already collected, just need phone
            if "phone number" in needs_collection:
                dispatcher.utter_message(text=tr(
                    lang,
                    f"May I have your phone number so our team can contact you regarding the {preferred_service.lower()}?",
                    f"Boleh saya dapatkan nombor telefon anda supaya pasukan kami boleh hubungi anda mengenai {preferred_service.lower()}?",
                    f"可以告诉我您的电话号码吗？我们的团队会就{preferred_service.lower()}联系您。",
                ))

    from actions.lead import ActionPrefillLeadCapture
    events = ActionPrefillLeadCapture().run(dispatcher, tracker, {})

    # Clear only non-persistent product search slots
    clearable = set(MANAGED_SLOTS) - set(PERSISTENT_SLOTS)
    for slot_name in clearable:
        if tracker.get_slot(slot_name) is not None:
            events.append(SlotSet(slot_name, None))

    support_case_id = str(tracker.get_slot("support_case_id") or uuid.uuid4())

    events.append(SlotSet("preferred_language", lang))
    events.append(SlotSet("preferred_service", preferred_service))
    events.append(SlotSet("support_case_type", preferred_service))
    events.append(SlotSet("support_case_id", support_case_id))
    events.append(SlotSet("support_case_status", "pending"))
    events.append(SlotSet("current_flow", "support_flow"))
    events.append(SlotSet("requested_slot", None))
    events.append(ActiveLoop(None))
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
    if extract_lens_requirements(normalized):
        return True
    if detect_category_from_text(normalized):
        return True
    if BUDGET_KEYWORDS.search(normalized) or parse_budget_from_text(normalized):
        return True
    if brand_lookup and detect_brand_from_text(normalized, brand_lookup):
        return True
    if any(token in normalized for token in ["frame", "sunglasses", "contact lenses", "glasses", "shades"]):
        return True
    return False


LENS_FILTER_COLUMNS = {
    "uv_protection",
    "polarized",
    "lens_color",
    "lens_type",
    "lens_feature",
    "lens_duration",
    "multifocal",
}


def is_explicit_lens_education_query(text: str) -> bool:
    normalized = normalize_search_text(text)
    return bool(re.search(r"\b(what is|what are|explain|difference|compare|meaning|tell me about|learn about)\b", normalized))


def extract_lens_requirements(text: str) -> Dict[str, set]:
    normalized = normalize_search_text(text)
    compact = normalized.replace(" ", "")
    filters: Dict[str, set] = {}

    def add(column: str, value: str) -> None:
        filters.setdefault(column, set()).add(value)

    if re.search(r"\b(single vision|sv lenses?|normal lenses?)\b", normalized):
        add("lens_type", "Single Vision")
    if re.search(r"\b(blue light|anti blue light|screen protection|computer work|screen time|gaming glasses|office glasses|digital screens?)\b", normalized):
        add("lens_feature", "Blue Light Filter")
    if re.search(r"\b(progressive|reading and distance|age related vision correction)\b", normalized):
        add("lens_type", "Progressive")
    if re.search(r"\b(bifocal|near and far vision)\b", normalized):
        add("lens_type", "Bifocal")
    if re.search(r"\b(multifocal)\b", normalized):
        add("multifocal", "yes")
    if re.search(r"\b(polarized|polarised|polarizing|polarising|glare reduction|driving sunglasses?)\b", normalized):
        add("polarized", "yes")
    if re.search(r"\b(uv protection|uv blocking|sun protection|sunlight|protect eyes from sunlight)\b", normalized) or "uvblocking" in compact:
        add("uv_protection", "yes")
    if re.search(r"\b(transition lenses?|photochromic|darken outdoors?)\b", normalized):
        add("lens_feature", "Photochromic")

    return filters


from search.filters import _lens_feature_match, _yes_no_match
from search.engine import rank_products_safely


def unique_cities(df: pd.DataFrame) -> List[str]:
    if "city" not in df.columns:
        return []
    cities = [str(city).strip() for city in df["city"].tolist() if str(city).strip()]
    return sorted(set(cities), key=str.lower)


def search_store_rows(df: pd.DataFrame, city: str) -> pd.DataFrame:
    if "city" not in df.columns:
        return pd.DataFrame(columns=["store_location", "city"])
    columns = [col for col in ["store_location", "city", "address", "phone", "state", "image_url", "imageUrl", "mapUrl", "map_url"] if col in df.columns]
    return df[df["city"].astype(str).str.contains(city, case=False, na=False)][
        columns or ["city"]
    ].drop_duplicates()


def list_store_cities() -> List[str]:
    response = gateway.get_json("/stores/cities")
    if isinstance(response, dict):
        cities = response.get("cities")
        if isinstance(cities, list):
            return sorted({str(city).strip() for city in cities if str(city).strip()}, key=str.lower)
    return []


def search_store_records(city: str, limit: int = 5) -> List[Dict[str, Any]]:
    stores = gateway.search_stores(city)
    if not isinstance(stores, list):
        return []
    return stores[: max(1, limit)]


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


def support_nav_buttons(lang: str) -> List[Dict[str, str]]:
    """Standardised 3-button navigation tail appended to every support response.

    Keeps navigation consistent across all support flows so the user always
    has the same exit paths regardless of which support action handled their
    request.
    """
    return [
        {"title": tr(lang, "Back to Support", "Kembali ke Sokongan", "返回支持"), "payload": "/support_and_policies"},
        {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
        {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": "/ask_a_question"},
    ]


def lens_recommendation_note(product: Dict[str, Any], lang: str = "en") -> str:
    lens_feature = str(product.get("lens_feature") or "").strip().lower()
    lens_type = str(product.get("lens_type") or "").strip().lower()
    polarized = str(product.get("polarized") or "").strip().lower()
    uv_protection = str(product.get("uv_protection") or "").strip().lower()
    multifocal = str(product.get("multifocal") or "").strip().lower()

    if "blue light" in lens_feature:
        return tr(
            lang,
            "Recommended for office work, students, gaming, and long screen usage.",
            "Disyorkan untuk kerja pejabat, pelajar, gaming, dan penggunaan skrin yang lama.",
            "推荐用于办公、学习、游戏和长时间使用屏幕。",
        )
    if "progressive" in lens_type:
        return tr(
            lang,
            "Recommended for reading and distance vision, presbyopia, and multifocal correction.",
            "Disyorkan untuk penglihatan membaca dan jarak jauh, presbiopia, dan pembetulan multifokal.",
            "推荐用于阅读和远距离视力、老花及多焦点矫正。",
        )
    if "bifocal" in lens_type or multifocal in {"yes", "true", "1", "y"}:
        return tr(
            lang,
            "Recommended for near and far vision needs and multifocal correction.",
            "Disyorkan untuk keperluan penglihatan dekat dan jauh serta pembetulan multifokal.",
            "推荐用于近远视力需求及多焦点矫正。",
        )
    if polarized in {"yes", "true", "1", "y"}:
        return tr(
            lang,
            "Recommended for driving, outdoor activities, and reducing glare.",
            "Disyorkan untuk memandu, aktiviti luar, dan mengurangkan silau.",
            "推荐用于驾驶、户外活动和减少眩光。",
        )
    if uv_protection in {"yes", "true", "1", "y"}:
        return tr(
            lang,
            "Recommended for sunlight exposure, outdoor wear, and eye protection.",
            "Disyorkan untuk pendedahan cahaya matahari, pemakaian luar, dan perlindungan mata.",
            "推荐用于阳光环境、户外佩戴和眼部保护。",
        )
    if "photochromic" in lens_feature:
        return tr(
            lang,
            "Recommended for all-day wear that moves between indoor and outdoor light.",
            "Disyorkan untuk pemakaian seharian antara cahaya dalaman dan luaran.",
            "推荐用于室内外光线切换的全天佩戴。",
        )
    return ""


def stylist_recommendation(product: Dict[str, Any], lang: str = "en") -> str:
    product_type = str(product.get("product_type") or product.get("category") or "").strip()
    material = titleize(product.get("frame_material"))
    shape = titleize(product.get("frame_shape"))
    lens_feature = str(product.get("lens_feature") or "").strip()
    lens_note = lens_recommendation_note(product, lang)

    if lens_note:
        return lens_note

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
        return tr(lang, "Recommended for clear, comfortable daily eyewear.", "Disyorkan untuk cermin mata harian yang jelas dan selesa.", "推荐用于清晰舒适的日常眼镜。")
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
    lens_feature = titleize(product.get("lens_feature"))
    lens_type = titleize(product.get("lens_type"))
    rating = product.get("rating")
    store_location = str(product.get("store_location") or "").strip()
    city = str(product.get("city") or "").strip()
    detail_parts = [part for part in [gender, material, shape, color, lens_feature, lens_type] if part]
    stylist_note = stylist_recommendation(product, lang)
    subtitle_sections = [
        tr(lang, f"Price: RM{price:.2f}", f"Harga: RM{price:.2f}", f"价格：RM{price:.2f}"),
        tr(lang, f"Brand: {brand}", f"Jenama: {brand}", f"品牌：{brand}") if brand else "",
        tr(lang, f"Category: {product_type}", f"Kategori: {product_type}", f"类别：{product_type}") if product_type else "",
        tr(lang, f"Specs: {' • '.join(detail_parts)}", f"Spesifikasi: {' • '.join(detail_parts)}", f"规格：{' • '.join(detail_parts)}") if detail_parts else "",
        tr(lang, f"Rating: {rating}/5", f"Penilaian: {rating}/5", f"评分：{rating}/5") if rating not in (None, "") else "",
        tr(lang, f"Stylist note: {stylist_note}", f"Cadangan stylist: {stylist_note}", f"造型建议：{stylist_note}") if stylist_note else "",
    ]

    theme = choose_product_image_theme(product_type, preferred_service)
    raw_image = product.get("imageUrl") or product.get("image_url")
    fallback_image = (
        product.get("fallback_image_url")
        or product.get("fallbackImageUrl")
        or product.get("fallback_url")
        or product.get("fallbackUrl")
    )

    # All channels (WhatsApp included) use the real product image, then the
    # configured fallback image, then a generated placeholder as a last resort.
    # Relative paths are absolutised via PUBLIC_BASE_URL so channels that fetch
    # images from the public internet (WhatsApp/Telegram/Messenger) can load them.
    image_url = (
        _resolve_card_image_url(raw_image)
        or _resolve_card_image_url(fallback_image)
        or build_placeholder_image(f"{brand} {name}", theme)
    )

    # Build a context-aware Book Visit payload so ActionBookAppointment can
    # enrich the lead with the brand and product type the user was viewing.
    _book_parts = ['"service":"Store Visit"']
    if brand:
        _safe_brand = str(brand).replace('"', '\\"')
        _book_parts.append(f'"brand":"{_safe_brand}"')
    if product_type:
        _safe_pt = str(product_type).replace('"', '\\"')
        _book_parts.append(f'"product_type":"{_safe_pt}"')
    _book_payload = '/book_appointment{' + ', '.join(_book_parts) + '}'

    actions = []
    actions.append({"type": "postback", "title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "value": _book_payload})
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


def emit_store_card(
    dispatcher: CollectingDispatcher,
    store_location: str,
    city: str,
    lang: str = "en",
    address: str = "",
    phone: str = "",
    image_url: Optional[str] = None,
    map_url: Optional[str] = None,
    channel: str = "",
) -> None:
    is_whatsapp = str(channel or "").lower() == "whatsapp"
    resolved_image_url = (
        build_placeholder_image(f"{store_location or 'Calisto Store'} {city}", "store")
        if is_whatsapp
        else (_resolve_card_image_url(image_url) or build_placeholder_image(f"{store_location or 'Calisto Store'} {city}", "store"))
    )
    static_map_url = map_url or "https://maps.google.com/?q=Calisto%20Eyewear"
    subtitle_lines = [
        tr(lang, f"City: {city}", f"Bandar: {city}", f"城市：{city}") if city else "",
        tr(lang, f"Address: {address}", f"Alamat: {address}", f"地址：{address}") if address else "",
        tr(lang, f"Phone: {phone}", f"Telefon: {phone}", f"电话：{phone}") if phone else "",
        tr(lang, "Get directions or continue to book a visit.", "Dapatkan arah atau teruskan untuk tempah lawatan.", "获取路线或继续预约到店。"),
    ]
    dispatcher.utter_message(
        json_message={
            "type": "card",
            "title": store_location or "Calisto Store",
            "subtitle": "\n".join(line for line in subtitle_lines if line).strip(),
            "imageUrl": resolved_image_url,
            "actions": [
                {
                    "type": "url",
                    "title": tr(lang, "Open Map", "Buka Peta", "打开地图"),
                    "value": static_map_url,
                },
                {
                    "type": "postback",
                    "title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"),
                    "value": '/book_appointment{"service":"Store Visit"}',
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


from forms.validators import (
    normalize_free_text,
    strip_common_prefixes,
    is_refusal,
    is_valid_name,
    normalize_name,
    is_valid_phone,
    normalize_phone,
    is_valid_email,
    normalize_email,
    is_valid_location,
    is_valid_service,
    normalize_timeline,
)


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

