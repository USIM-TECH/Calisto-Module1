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
from rasa_sdk.events import SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.forms import FormValidationAction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CATALOGUE_PATH = os.getenv(
    "KB_CATALOGUE_PATH",
    "knowledge_base/calisto_product_catalog_500.csv",
)
BOOKING_URL = os.getenv("BOOKING_URL", "https://calisto.example.com/book")


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


def filter_by_budget(df: pd.DataFrame, budget_slot: Text) -> pd.DataFrame:
    if not budget_slot:
        return df

    budget_lower = str(budget_slot).lower().replace(" ", "").replace("–", "-")
    if "underrm100" in budget_lower:
        return df[df["price_myr"] < 100]
    if "rm100-rm250" in budget_lower:
        return df[(df["price_myr"] >= 100) & (df["price_myr"] <= 250)]
    if "rm250-rm300" in budget_lower:
        return df[(df["price_myr"] >= 250) & (df["price_myr"] <= 300)]
    if "aboverm300" in budget_lower:
        return df[df["price_myr"] > 300]

    match_under = re.search(r"under\s*rm\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_under:
        return df[df["price_myr"] <= float(match_under.group(1))]

    match_over = re.search(r"(?:over|above)\s*rm\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_over:
        return df[df["price_myr"] >= float(match_over.group(1))]

    match_range = re.search(r"rm?\s*(\d+(?:\.\d+)?)\s*-\s*rm?\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_range:
        low = float(match_range.group(1))
        high = float(match_range.group(2))
        return df[(df["price_myr"] >= low) & (df["price_myr"] <= high)]

    return df


def format_product(row: pd.Series) -> str:
    brand = row.get("brand") or "Unknown Brand"
    name = row.get("product_name") or "Unknown Product"
    price = row.get("price_myr")
    city = row.get("city") or ""
    store = row.get("store_location") or ""
    suffix = f"\nLocation: {store}, {city}".rstrip(", ")
    return f"{brand} - {name}\nPrice: RM{float(price):.2f}{suffix}"


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


def lead_buttons(preferred_service: Optional[str] = None) -> List[Dict[str, str]]:
    payload = '/capture_lead'
    if preferred_service:
        safe_service = str(preferred_service).replace('"', '\\"')
        payload = f'/capture_lead{{"preferred_service":"{safe_service}"}}'
    return [
        {"title": "Book Visit", "payload": "/book_appointment"},
        {"title": "Find Store", "payload": "/find_a_store"},
        {"title": "Consult Now", "payload": payload},
    ]


def emit_product_card(dispatcher: CollectingDispatcher, product: Dict[str, Any], preferred_service: Optional[str]) -> None:
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
        f"Price: RM{price:.2f}",
        f"Category: {product_type}" if product_type else "",
        f"Specs: {' • '.join(detail_parts)}" if detail_parts else "",
        f"Availability: {stock}" if stock else "",
        f"Rating: {rating}/5" if rating not in (None, "") else "",
        f"Store: {store_location}, {city}".strip(", ") if (store_location or city) else "",
    ]

    actions = []
    if store_location or city:
        actions.append({
            "type": "url",
            "title": "Open Store Map",
            "value": build_maps_url(store_location, city, "Calisto Eyewear"),
        })
    actions.append({"type": "postback", "title": "Book Visit", "value": "/book_appointment"})
    actions.append({
        "type": "postback",
        "title": "Consult Now",
        "value": lead_buttons(preferred_service)[-1]["payload"],
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


def emit_store_card(dispatcher: CollectingDispatcher, store_location: str, city: str) -> None:
    dispatcher.utter_message(
        json_message={
            "type": "card",
            "title": store_location or "Calisto Store",
            "subtitle": "\n".join([
                f"City: {city}" if city else "",
                "Get directions or continue to book a visit.",
            ]).strip(),
            "imageUrl": build_placeholder_image(f"{store_location or 'Calisto Store'} {city}", "store"),
            "actions": [
                {
                    "type": "url",
                    "title": "Map",
                    "value": build_maps_url(store_location, city, "Calisto Eyewear"),
                },
                {
                    "type": "postback",
                    "title": "Book Visit",
                    "value": '/capture_lead{"preferred_service":"Store Visit"}',
                },
            ],
        }
    )


def latest_metadata(tracker: Tracker) -> Dict[str, Any]:
    latest_message = tracker.latest_message if isinstance(tracker.latest_message, dict) else {}
    metadata = latest_message.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


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
        }

        for slot_name, value in slot_mappings.items():
            if tracker.get_slot(slot_name):
                continue
            normalized = str(value).strip() if isinstance(value, str) else ""
            if normalized:
                events.append(SlotSet(slot_name, normalized))

        return events


class ValidateLeadCaptureForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_lead_capture_form"

    async def validate_lead_name(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        value = str(slot_value).strip()
        if len(value) < 2:
            dispatcher.utter_message(text="Please share a valid name with at least 2 characters.")
            return {"lead_name": None}
        return {"lead_name": value}

    async def validate_contact_number(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        digits = re.sub(r"[^\d+]", "", str(slot_value))
        if len(re.sub(r"\D", "", digits)) < 8:
            dispatcher.utter_message(text="Please provide a valid phone number including area or country code.")
            return {"contact_number": None}
        return {"contact_number": digits}

    async def validate_email(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        value = str(slot_value).strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
            dispatcher.utter_message(text="Please provide a valid email address.")
            return {"email": None}
        return {"email": value.lower()}

    async def validate_lead_location(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        value = str(slot_value).strip()
        if len(value) < 2:
            dispatcher.utter_message(text="Please share your city or area so we can route your inquiry properly.")
            return {"lead_location": None}
        return {"lead_location": value}

    async def validate_preferred_service(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        value = str(slot_value).strip()
        if len(value) < 3:
            dispatcher.utter_message(text="Please tell us which product or service you are interested in.")
            return {"preferred_service": None}
        return {"preferred_service": value}

    async def validate_purchase_timeline(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        value = str(slot_value).strip()
        allowed = {
            "this week": "This Week",
            "within 2 weeks": "Within 2 Weeks",
            "just exploring": "Just Exploring",
        }
        normalized = allowed.get(value.lower())
        if normalized:
            return {"purchase_timeline": normalized}

        if len(value) < 3:
            dispatcher.utter_message(text="Let me know if you are ready this week, within 2 weeks, or just exploring.")
            return {"purchase_timeline": None}

        return {"purchase_timeline": value}


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
        product_type = tracker.get_slot("product_type")
        brand = tracker.get_slot("brand")
        price_range = tracker.get_slot("price_range")

        backend_results = gateway.search_products({
            "product_type": product_type,
            "brand": brand,
            "price_range": price_range,
        })
        if backend_results:
            for product in backend_results[:4]:
                emit_product_card(dispatcher, product, str(product_type or brand or ""))
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
        filtered_df = filter_by_budget(filtered_df, price_range)
        top_5 = filtered_df.head(5)

        if top_5.empty:
            dispatcher.utter_message(
                text="We could not find eyewear matching your criteria. Try another brand or budget."
            )
            return []

        for _, row in top_5.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(product_type or brand or ""))
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
            dispatcher.utter_message(text="I can explain different lens solutions if you tell me which one you are considering.")
        dispatcher.utter_message(
            response="utter_next_step_lens_help",
            buttons=[
                {"title": "Set Budget", "payload": '/select_budget{"price_range":"RM100 - RM250"}'},
                {"title": "Find Store", "payload": "/find_a_store"},
                {"title": "Talk to Consultant", "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
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
        cities = unique_cities(load_catalogue())
        buttons = [
            {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
            for city in cities[:10]
        ]
        dispatcher.utter_message(text="Which city are you looking for?", buttons=buttons or None)
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
        city = tracker.get_slot("city") or tracker.get_slot("lead_location")
        if not city:
            dispatcher.utter_message(text="Please specify the city to find a store.")
            return []

        backend_stores = gateway.search_stores(str(city))
        if backend_stores:
            for store in backend_stores[:6]:
                emit_store_card(
                    dispatcher,
                    str(store.get('store_location', 'Calisto Store')),
                    str(store.get('city', city)),
                )
            return []

        stores = search_store_rows(load_catalogue(), str(city))
        if stores.empty:
            dispatcher.utter_message(text=f"I could not find any Calisto stores in {titleize(city)}.")
            return []

        for _, row in stores.head(6).iterrows():
            emit_store_card(
                dispatcher,
                str(row.get('store_location', 'Calisto Store')),
                str(row.get('city', city)),
            )
        return []


class ActionSearchProductByAttribute(Action):
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
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
            dispatcher.utter_message(text="I could not find products matching that description.")
            return []

        for _, row in top_5.iterrows():
            emit_product_card(dispatcher, row.to_dict(), "Product Recommendation")
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
            dispatcher.utter_message(text="We could not find any lenses matching your criteria.")
            return []

        for _, row in results.iterrows():
            emit_product_card(dispatcher, row.to_dict(), str(lens_type or "Lens Consultation"))
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
            text = "Which brand of contact lenses would you like to explore?"
        elif product_type and "sunglasses" in str(product_type).lower():
            text = "What brand of sunglasses are you interested in?"
        else:
            text = "Which brand would you like to explore?"

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
        payload = {
            "name": tracker.get_slot("lead_name"),
            "phone": tracker.get_slot("contact_number"),
            "email": tracker.get_slot("email"),
            "location": tracker.get_slot("lead_location"),
            "preferred_service": tracker.get_slot("preferred_service") or tracker.get_slot("product_type"),
            "purchase_timeline": tracker.get_slot("purchase_timeline"),
            "lead_status": tracker.get_slot("lead_status"),
            "latest_intent": tracker.latest_message.get("intent", {}).get("name"),
        }

        response = gateway.submit_lead(payload)
        status = tracker.get_slot("lead_status")
        if status == "qualified":
            dispatcher.utter_message(
                text=(
                    "Thanks, your request is qualified and our team will follow up shortly.\n"
                    f"You can also book directly here: {BOOKING_URL}"
                ),
                buttons=[
                    {"title": "Book Appointment", "payload": "/book_appointment"},
                    {"title": "Find Store", "payload": "/find_a_store"},
                    {"title": "Browse Eyewear", "payload": "/browse_eyewear"},
                ],
            )
        else:
            dispatcher.utter_message(
                response="utter_lead_not_qualified",
                buttons=[
                    {"title": "Find Store", "payload": "/find_a_store"},
                    {"title": "Browse Eyewear", "payload": "/browse_eyewear"},
                    {"title": "Ask Another Question", "payload": "/ask_faq"},
                ],
            )

        if response and response.get("lead_id"):
            dispatcher.utter_message(text=f"Reference ID: {response['lead_id']}")
        return []
