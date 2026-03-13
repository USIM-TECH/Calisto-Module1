"""Runtime loaders for Calisto chatbot knowledge-base data in PostgreSQL."""

from __future__ import annotations

from collections import defaultdict
from difflib import get_close_matches
from typing import Any, Dict, List, Optional

from actions.knowledge_base.postgres_store import KnowledgeBaseStorage


class _SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


class CalistoKnowledgeBase:
    """Loads structured product, store, order, and chatbot content from PostgreSQL."""

    _instance: Optional["CalistoKnowledgeBase"] = None

    def __init__(self) -> None:
        storage = KnowledgeBaseStorage.get()
        self.store_locations = storage.store_locations_payload()
        self.conversation = storage.conversation_payload()
        self.product_catalog = storage.product_catalog_rows()
        self.orders = storage.orders_payload()
        self._stores_by_city = self._group_stores_by_city()
        self._aliases = self._build_alias_map()

    @classmethod
    def get(cls) -> "CalistoKnowledgeBase":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Conversation templates ───────────────────────────────

    def prompt(self, key: str, **values: Any) -> str:
        template = self.conversation["prompts"][key]
        return template.format_map(_SafeFormatDict(values))

    def response(self, key: str, **values: Any) -> str:
        template = self.conversation["responses"][key]
        return template.format_map(_SafeFormatDict(values))

    def face_shape_styles(self, face_shape: str) -> List[str]:
        return self.conversation.get("face_shape_styles", {}).get(face_shape.lower().strip(), [])

    # ── Product catalog (CSV) ────────────────────────────────

    def list_categories(self) -> List[str]:
        """Return sorted unique categories from the product catalog CSV."""
        return sorted({row["Category"] for row in self.product_catalog})

    def product_overview(self, sample_limit: int = 5) -> Dict[str, Any]:
        categories = self.list_categories()
        samples = sorted(self.product_catalog, key=lambda row: float(row["Price_MYR"]))[:sample_limit]
        return {"categories": categories, "samples": samples}

    def search_products(
        self,
        category: Optional[str] = None,
        budget: Optional[int] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Search products from the CSV catalog by category and budget."""
        candidates = list(self.product_catalog)

        if category:
            resolved = self.normalize_category(category)
            if resolved:
                candidates = [row for row in candidates if row["Category"] == resolved]

        # Sort by price ascending
        candidates.sort(key=lambda row: float(row["Price_MYR"]))

        # Deduplicate by Product_Name (keep cheapest)
        seen_names: set = set()
        deduped: List[Dict[str, Any]] = []
        for row in candidates:
            if row["Product_Name"] not in seen_names:
                seen_names.add(row["Product_Name"])
                deduped.append(row)

        if budget is not None:
            within_budget = [row for row in deduped if float(row["Price_MYR"]) <= budget]
            if within_budget:
                return within_budget[:limit]

        return deduped[:limit]

    def featured_products(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Return a sample of popular products across categories."""
        result: List[Dict[str, Any]] = []
        for cat in self.list_categories():
            cat_items = [row for row in self.product_catalog if row["Category"] == cat]
            if cat_items:
                cat_items.sort(key=lambda r: float(r["Price_MYR"]))
                result.append(cat_items[len(cat_items) // 2])  # pick mid-priced item
        return result[:limit]

    def lens_price_summary(self) -> List[Dict[str, Any]]:
        grouped: Dict[str, List[float]] = defaultdict(list)
        for row in self.product_catalog:
            if row.get("Category") != "Prescription Lenses":
                continue
            grouped[row["Product_Name"]].append(float(row["Price_MYR"]))

        summary = []
        for product_name, prices in sorted(grouped.items()):
            summary.append(
                {
                    "name": product_name,
                    "min_price": min(prices),
                    "max_price": max(prices),
                }
            )
        return summary

    def normalize_category(self, value: Optional[str]) -> Optional[str]:
        """Map user input to an actual CSV category name."""
        if not value:
            return None
        lowered = value.lower().strip()

        # Prefer specific intents first before generic terms like "glasses" / "frames".
        if any(token in lowered for token in ("presc", "prescription", "rx", "power lens", "progressive", "single vision")):
            return "Prescription Lenses"
        if "contact" in lowered:
            return "Contact Lens Solutions"
        if any(token in lowered for token in ("service", "consult", "fitting", "eye test", "exam")):
            return "Professional Services"
        if any(token in lowered for token in ("sunglass", "sun", "shade", "luxury")):
            return "Luxury Sunglasses"

        category_map = {
            "sunglasses": "Luxury Sunglasses",
            "sunglass": "Luxury Sunglasses",
            "sun": "Luxury Sunglasses",
            "shades": "Luxury Sunglasses",
            "luxury": "Luxury Sunglasses",
            "frames": "Designer Frames",
            "frame": "Designer Frames",
            "designer": "Designer Frames",
            "eyeglasses": "Designer Frames",
            "spectacles": "Designer Frames",
            "glasses": "Designer Frames",
            "prescription": "Prescription Lenses",
            "lenses": "Prescription Lenses",
            "lens": "Prescription Lenses",
            "contact": "Contact Lens Solutions",
            "contact lens": "Contact Lens Solutions",
            "contact lenses": "Contact Lens Solutions",
            "services": "Professional Services",
            "service": "Professional Services",
            "consultation": "Professional Services",
            "fitting": "Professional Services",
            "eye test": "Professional Services",
        }
        for key, cat in category_map.items():
            if key in lowered:
                return cat
        # Try direct match against actual category names
        for cat in self.list_categories():
            if lowered in cat.lower() or cat.lower() in lowered:
                return cat
        return None

    # ── Order lookup ─────────────────────────────────────────

    def fetch_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Look up an order from the orders knowledge base file."""
        key = order_id.strip().upper()
        return self.orders.get(key) or self.orders.get(order_id.strip())

    # ── Store lookup ─────────────────────────────────────────

    def fetch_stores(self, city: str) -> List[Dict[str, str]]:
        key = city.lower().strip()
        canonical = self._aliases.get(key, key)
        if canonical in self._stores_by_city:
            return self._stores_by_city[canonical]

        partial_matches = [
            stores for city_key, stores in self._stores_by_city.items()
            if key in city_key or city_key in key
        ]
        if partial_matches:
            return partial_matches[0]

        all_keys = list(self._aliases.keys()) + list(self._stores_by_city.keys())
        matches = get_close_matches(key, all_keys, n=1, cutoff=0.6)
        if matches:
            matched = matches[0]
            resolved = self._aliases.get(matched, matched)
            return self._stores_by_city.get(resolved, [])

        return []

    def detect_city(self, text: str) -> Optional[str]:
        lowered = text.lower()
        for alias, canonical in self._aliases.items():
            if alias in lowered:
                return canonical.title()
        for city in self._stores_by_city:
            if city in lowered:
                return city.title()
        matches = get_close_matches(
            lowered.strip(),
            list(self._aliases.keys()) + list(self._stores_by_city.keys()),
            n=1, cutoff=0.6,
        )
        if matches:
            return self._aliases.get(matches[0], matches[0]).title()
        return None

    def supported_cities(self) -> str:
        return " · ".join(city.title() for city in sorted(self._stores_by_city.keys()))

    # ── Internal helpers ─────────────────────────────────────

    def _group_stores_by_city(self) -> Dict[str, List[Dict[str, str]]]:
        grouped: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        for store in self.store_locations["stores"]:
            grouped[store["city"]].append(store)
        return dict(grouped)

    def _build_alias_map(self) -> Dict[str, str]:
        aliases: Dict[str, str] = {}
        for store in self.store_locations["stores"]:
            aliases[store["city"]] = store["city"]
            for alias in store.get("aliases", []):
                aliases[alias] = store["city"]
        for alias, city in self.store_locations.get("city_redirects", {}).items():
            aliases[alias] = city
        return aliases