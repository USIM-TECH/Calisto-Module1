import re
from typing import Any, Dict

from config.constants import CANONICAL_ALIASES

def canonical_text_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower()).strip()

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
