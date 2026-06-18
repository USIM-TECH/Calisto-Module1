import re
from typing import Any, Dict, List, Optional
from functools import lru_cache



def normalize_city_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[\[\]{}()\.,;:!?'\"]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

@lru_cache(maxsize=1)
def city_key_registry() -> Dict[str, str]:
    from actions.actions import unique_cities
    from search.catalogue import load_catalogue
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
    text = re.sub(r"\s+", " ", str(value or "").strip())
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
