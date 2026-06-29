import re
from typing import Any, Dict, Optional
from config.regex_patterns import (
    BUDGET_LOW_REGEX,
    BUDGET_AFFORDABLE_REGEX,
    BUDGET_PREMIUM_REGEX,
    BUDGET_BETWEEN_REGEX,
    BUDGET_UNDER_REGEX,
    BUDGET_OVER_REGEX,
    BUDGET_AROUND_REGEX
)

def parse_budget_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Deterministically extract budget constraints from free text. Returns dict with
    budget_min and/or budget_max keys, or None if no budget found."""
    if not text:
        return None
    t = text.lower().replace("rm", "").replace(",", "").strip()
    result: Dict[str, Any] = {}

    if BUDGET_LOW_REGEX.search(t):
        result["budget_bucket"] = "low"
    elif BUDGET_AFFORDABLE_REGEX.search(t):
        result["budget_max"] = 300.0
    elif BUDGET_PREMIUM_REGEX.search(t):
        result["budget_min"] = 700.0
        result["budget_bucket"] = "premium"

    m = BUDGET_BETWEEN_REGEX.search(t)
    if m:
        result["budget_min"] = float(m.group(1))
        result["budget_max"] = float(m.group(2))
        return result

    m = BUDGET_UNDER_REGEX.search(t)
    if m:
        result["budget_max"] = float(m.group(1))
        return result

    m = BUDGET_OVER_REGEX.search(t)
    if m:
        result["budget_min"] = float(m.group(1))
        return result

    m = BUDGET_AROUND_REGEX.search(t)
    if m:
        center = float(m.group(1))
        delta = max(center * 0.2, 50.0)
        result["budget_min"] = max(center - delta, 0)
        result["budget_max"] = center + delta
        return result

    return result if result else None
