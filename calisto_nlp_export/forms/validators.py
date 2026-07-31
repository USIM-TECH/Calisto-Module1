import re
from typing import Any, Optional

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
        "hi",
        "hello",
        "hey",
        "halo",
        "yo",
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
