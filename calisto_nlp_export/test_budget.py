import re
from typing import Optional, Dict, Any

def parse_budget_from_text(text: str) -> Optional[Dict[str, Any]]:
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

print(parse_budget_from_text("sunglasses under 100rm"))
print(parse_budget_from_text("sunglasses under 1000rm"))
print(parse_budget_from_text("glasses between 600 and 750rm"))
