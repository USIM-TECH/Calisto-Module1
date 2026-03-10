"""
Calisto Eyewear – Custom Rasa Actions
======================================
Three primary actions + three form validators.

Actions
-------
- ActionRecommendFrames      → Suggests frames by style / gender / budget / face shape
- ActionCheckOrderStatus     → Looks up order status by order_id slot
- ActionFindNearestStore     → Returns store info for the given city slot

Form Validators
---------------
- ValidateFrameSearchForm
- ValidateOrderTrackingForm
- ValidateEyeTestForm

Run with:  rasa run actions --actions actions.actions
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Text

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

logger = logging.getLogger(__name__)

# ============================================================
# Simulated Backend Data
# In production replace each _fetch_* method with a real
# HTTP call to your order-management / product / store API.
# ============================================================

# ── Frame Catalogue ─────────────────────────────────────────
FRAME_CATALOG: Dict[str, Dict[str, List[Dict]]] = {
    "round": {
        "men": [
            {"name": "Calisto Retro Round",   "price": 1999, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-RR-M01"},
            {"name": "Calisto Classic Circle","price": 2499, "material": "Metal",           "color": "Gold",      "sku": "CAL-CC-M02"},
            {"name": "Calisto Vintage Round", "price": 1499, "material": "TR90",            "color": "Black",     "sku": "CAL-VR-M03"},
        ],
        "women": [
            {"name": "Calisto Chic Round",    "price": 2199, "material": "Acetate",        "color": "Rose Gold", "sku": "CAL-CR-W01"},
            {"name": "Calisto Elegant Circle","price": 2999, "material": "Premium Metal",  "color": "Silver",    "sku": "CAL-EC-W02"},
            {"name": "Calisto Petite Round",  "price": 1799, "material": "TR90",            "color": "Purple",    "sku": "CAL-PR-W03"},
        ],
        "unisex": [
            {"name": "Calisto Neo Round",     "price": 1699, "material": "TR90",            "color": "Matte Black","sku": "CAL-NR-U01"},
        ],
    },
    "rectangular": {
        "men": [
            {"name": "Calisto Pro Rectangle", "price": 2299, "material": "Titanium",       "color": "Gunmetal",  "sku": "CAL-PR-M01"},
            {"name": "Calisto Sharp Edge",    "price": 1899, "material": "Acetate",        "color": "Dark Brown","sku": "CAL-SE-M02"},
        ],
        "women": [
            {"name": "Calisto Slim Rectangle","price": 1999, "material": "Metal",           "color": "Rose Gold", "sku": "CAL-SR-W01"},
        ],
        "unisex": [
            {"name": "Calisto Classic Rect",  "price": 1499, "material": "TR90",            "color": "Black",     "sku": "CAL-CR-U01"},
        ],
    },
    "square": {
        "men": [
            {"name": "Calisto Bold Square",   "price": 2499, "material": "Acetate",        "color": "Black",     "sku": "CAL-BS-M01"},
            {"name": "Calisto Power Square",  "price": 1999, "material": "Metal",           "color": "Silver",    "sku": "CAL-PS-M02"},
        ],
        "women": [
            {"name": "Calisto Fierce Square", "price": 2299, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-FS-W01"},
        ],
        "unisex": [
            {"name": "Calisto Urban Square",  "price": 1799, "material": "TR90",            "color": "Blue",      "sku": "CAL-US-U01"},
        ],
    },
    "cat-eye": {
        "men": [],
        "women": [
            {"name": "Calisto Glamour Cat-Eye","price": 2799, "material": "Acetate",       "color": "Cherry Red","sku": "CAL-GC-W01"},
            {"name": "Calisto Retro Cat-Eye", "price": 2299, "material": "Acetate",        "color": "Black-Gold","sku": "CAL-RC-W02"},
            {"name": "Calisto Chic Cat-Eye",  "price": 1999, "material": "TR90",            "color": "Leopard",   "sku": "CAL-CC-W03"},
        ],
        "unisex": [
            {"name": "Calisto Modern Cat-Eye","price": 2199, "material": "Metal",          "color": "Rose Gold", "sku": "CAL-MC-U01"},
        ],
    },
    "aviator": {
        "men": [
            {"name": "Calisto Ace Aviator",   "price": 1999, "material": "Metal",           "color": "Gold",      "sku": "CAL-AA-M01"},
            {"name": "Calisto Sky Aviator",   "price": 2499, "material": "Titanium",        "color": "Silver",    "sku": "CAL-SA-M02"},
        ],
        "women": [
            {"name": "Calisto Femme Aviator", "price": 2199, "material": "Metal",           "color": "Rose Gold", "sku": "CAL-FA-W01"},
        ],
        "unisex": [
            {"name": "Calisto Classic Aviator","price": 1699, "material": "Metal",          "color": "Gunmetal",  "sku": "CAL-CA-U01"},
        ],
    },
    "wayfarer": {
        "men": [
            {"name": "Calisto Street Wayfarer","price": 1799, "material": "Acetate",       "color": "Black",     "sku": "CAL-SW-M01"},
        ],
        "women": [
            {"name": "Calisto Trend Wayfarer","price": 1999, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-TW-W01"},
        ],
        "unisex": [
            {"name": "Calisto Original Wayfarer","price": 1699,"material": "Acetate",      "color": "Classic Black","sku": "CAL-OW-U01"},
        ],
    },
    "oval": {
        "men": [
            {"name": "Calisto Smooth Oval",   "price": 1899, "material": "TR90",            "color": "Brown",     "sku": "CAL-SO-M01"},
        ],
        "women": [
            {"name": "Calisto Dainty Oval",   "price": 2099, "material": "Metal",           "color": "Gold",      "sku": "CAL-DO-W01"},
        ],
        "unisex": [
            {"name": "Calisto Neo Oval",       "price": 1599, "material": "TR90",            "color": "Black",     "sku": "CAL-NO-U01"},
        ],
    },
}

FACE_SHAPE_STYLES: Dict[str, List[str]] = {
    "round":   ["rectangular", "square", "wayfarer"],
    "oval":    ["round", "aviator", "wayfarer", "cat-eye"],
    "square":  ["round", "oval", "cat-eye"],
    "heart":   ["wayfarer", "rectangular", "aviator"],
    "diamond": ["oval", "cat-eye", "rectangular"],
    "oblong":  ["aviator", "square", "wayfarer"],
}

FEATURED_FRAMES = [
    {"name": "Calisto Ace Aviator",    "price": 1999, "material": "Metal",   "sku": "CAL-AA-M01"},
    {"name": "Calisto Chic Round",     "price": 2199, "material": "Acetate", "sku": "CAL-CR-W01"},
    {"name": "Calisto Bold Square",    "price": 2499, "material": "Acetate", "sku": "CAL-BS-M01"},
    {"name": "Calisto Classic Aviator","price": 1699, "material": "Metal",   "sku": "CAL-CA-U01"},
]

# ── Order Database ───────────────────────────────────────────
ORDER_DATABASE: Dict[str, Dict] = {
    "45821":          {"status": "Shipped",    "carrier": "BlueDart",  "tracking": "BD78234561",   "eta": "2 days",    "step": "Out for Delivery"},
    "ORD12345":       {"status": "Processing", "carrier": "N/A",       "tracking": "N/A",           "eta": "5–7 days",  "step": "Quality Check in Progress"},
    "78562":          {"status": "Delivered",  "carrier": "Delhivery", "tracking": "DL98765432",   "eta": "Delivered", "step": "Delivered on 5 March 2026"},
    "CAL-2024-9876":  {"status": "Shipped",    "carrier": "DTDC",      "tracking": "DTDC12345",    "eta": "3 days",    "step": "In Transit – Bangalore Hub"},
    "CAL98231":       {"status": "Confirmed",  "carrier": "N/A",       "tracking": "N/A",           "eta": "7–10 days", "step": "Being Prepared at Warehouse"},
    "ORD98765":       {"status": "Shipped",    "carrier": "BlueDart",  "tracking": "BD99112233",   "eta": "1 day",     "step": "Out for Delivery"},
    "234567":         {"status": "Processing", "carrier": "N/A",       "tracking": "N/A",           "eta": "6–8 days",  "step": "Payment Confirmed"},
}

# ── Store Database ───────────────────────────────────────────
STORE_DATABASE: Dict[str, List[Dict]] = {
    "mumbai": [
        {"name": "Calisto – Bandra",         "address": "Shop 12, Linking Road, Bandra West, Mumbai 400050",           "phone": "+91 22-2640-1234", "hours": "Mon–Sun: 10AM–9PM"},
        {"name": "Calisto – Phoenix Kurla",  "address": "Level 2, Phoenix Market City, LBS Marg, Kurla, Mumbai 400070","phone": "+91 22-2503-5678", "hours": "Mon–Sun: 10AM–10PM"},
    ],
    "delhi": [
        {"name": "Calisto – Connaught Place","address": "Block A, Inner Circle, Connaught Place, New Delhi 110001",   "phone": "+91 11-2341-9012", "hours": "Mon–Sun: 10AM–9PM"},
        {"name": "Calisto – Select City Walk","address": "Level 1, Select City Walk, Saket, New Delhi 110017",         "phone": "+91 11-2956-3456", "hours": "Mon–Sun: 11AM–9PM"},
    ],
    "bangalore": [
        {"name": "Calisto – Brigade Road",  "address": "No. 45, Brigade Road, Bangalore 560001",                      "phone": "+91 80-4123-7890", "hours": "Mon–Sun: 10AM–9PM"},
        {"name": "Calisto – Indiranagar",   "address": "100 Feet Road, Indiranagar, Bangalore 560038",                 "phone": "+91 80-4125-6789", "hours": "Mon–Sun: 10AM–9PM"},
    ],
    "chennai": [
        {"name": "Calisto – T Nagar",       "address": "Usman Road, T. Nagar, Chennai 600017",                        "phone": "+91 44-4321-1234", "hours": "Mon–Sun: 10AM–8:30PM"},
    ],
    "hyderabad": [
        {"name": "Calisto – Banjara Hills", "address": "Road No. 12, Banjara Hills, Hyderabad 500034",                "phone": "+91 40-6789-0123", "hours": "Mon–Sun: 10AM–9PM"},
    ],
    "pune": [
        {"name": "Calisto – FC Road",       "address": "Fergusson College Road, Shivaji Nagar, Pune 411016",          "phone": "+91 20-2567-8901", "hours": "Mon–Sun: 10AM–9PM"},
    ],
}


# ============================================================
# Helpers
# ============================================================

def _normalise_gender(gender: Optional[str]) -> str:
    if not gender:
        return "unisex"
    g = gender.lower().strip()
    if any(k in g for k in ("men", "male", "gents", "man")):
        return "men"
    if any(k in g for k in ("women", "female", "ladies", "woman")):
        return "women"
    return "unisex"


def _parse_budget(budget: Optional[str]) -> Optional[int]:
    if not budget:
        return None
    nums = re.findall(r"\d+", str(budget))
    return int(nums[-1]) if nums else None


def _fetch_order(order_id: str) -> Optional[Dict]:
    """Simulate an order-management API lookup."""
    # Production: return requests.get(f"{ORDER_API}/orders/{order_id}", ...).json()
    key = order_id.strip().upper()
    return ORDER_DATABASE.get(key) or ORDER_DATABASE.get(order_id.strip())


def _fetch_stores(city: str) -> List[Dict]:
    """Simulate a store-locator API lookup."""
    # Production: return requests.get(f"{STORE_API}/stores?city={city}", ...).json()["stores"]
    city_lower = city.lower().strip()
    for key, stores in STORE_DATABASE.items():
        if key in city_lower or city_lower in key:
            return stores
    return []


# ============================================================
# ACTION: action_recommend_frames
# ============================================================

class ActionRecommendFrames(Action):
    """Recommends frames based on face shape, style, gender, and budget."""

    def name(self) -> Text:
        return "action_recommend_frames"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:

        frame_style = tracker.get_slot("frame_style")
        gender      = tracker.get_slot("gender")
        budget      = tracker.get_slot("budget")
        face_shape  = tracker.get_slot("face_shape")

        logger.info(
            "action_recommend_frames | style=%s gender=%s budget=%s face_shape=%s",
            frame_style, gender, budget, face_shape,
        )

        # ── Derive style from face shape when not given ──────
        if not frame_style and face_shape:
            shape_key   = face_shape.lower().strip()
            suggestions = FACE_SHAPE_STYLES.get(shape_key, [])
            if suggestions:
                frame_style = suggestions[0]
                style_list  = ", ".join(f"**{s}**" for s in suggestions)
                dispatcher.utter_message(
                    text=f"💡 For a **{face_shape}** face, we recommend: {style_list} frames.\n"
                         f"Let me show you our **{frame_style}** collection!"
                )

        if not frame_style:
            self._show_featured(dispatcher)
            return []

        gender_key   = _normalise_gender(gender)
        budget_value = _parse_budget(budget)
        style_key    = frame_style.lower().strip()

        catalog_entry = FRAME_CATALOG.get(style_key, {})
        candidates    = catalog_entry.get(gender_key, []) + catalog_entry.get("unisex", [])

        if not candidates:
            dispatcher.utter_message(
                text=(
                    f"I don't have exact **{frame_style}** frames for **{gender or 'you'}** right now, "
                    f"but here are some of our hottest picks! 🌟"
                )
            )
            self._show_featured(dispatcher)
            return []

        if budget_value:
            within_budget = [f for f in candidates if f["price"] <= budget_value]
            if within_budget:
                candidates = within_budget
            else:
                dispatcher.utter_message(
                    text=(
                        f"Hmm, no **{frame_style}** frames exactly within ₹{budget_value} right now. "
                        f"Here are the closest options:"
                    )
                )

        results = candidates[:3]
        lines   = [f"👓 **{frame_style.title()} Frames** from Calisto:\n"]
        for i, f in enumerate(results, 1):
            lines.append(
                f"{i}. **{f['name']}**\n"
                f"   💰 ₹{f['price']}  |  🔧 {f['material']}  |  🎨 {f['color']}\n"
                f"   🏷️ SKU: {f['sku']}\n"
            )
        lines.append(
            "\nLike what you see? Visit a store to try them on, "
            "or shall I help you find the nearest Calisto outlet? 😊"
        )
        dispatcher.utter_message(text="\n".join(lines))
        return []

    @staticmethod
    def _show_featured(dispatcher: CollectingDispatcher) -> None:
        lines = ["🌟 **Calisto Top Picks:**\n"]
        for i, f in enumerate(FEATURED_FRAMES, 1):
            lines.append(f"{i}. **{f['name']}** – ₹{f['price']} ({f['material']})  |  SKU: {f['sku']}")
        lines.append("\nShop online at **www.calisto.com** or visit a store near you!")
        dispatcher.utter_message(text="\n".join(lines))


# ============================================================
# ACTION: action_check_order_status
# ============================================================

class ActionCheckOrderStatus(Action):
    """Retrieves the live status of a Calisto order."""

    def name(self) -> Text:
        return "action_check_order_status"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:

        order_id = tracker.get_slot("order_id")

        # Fallback: scan the latest message with regex when slot is empty
        if not order_id:
            text  = tracker.latest_message.get("text", "")
            match = re.search(r"\b(CAL-\d{4}-\d{4}|[A-Za-z]{0,3}\d{5,10})\b", text)
            if match:
                order_id = match.group(1)

        if not order_id:
            dispatcher.utter_message(
                text=(
                    "I need your **Order ID** to check the status. "
                    "It looks like: `45821`, `ORD12345`, or `CAL-2024-9876`.\n"
                    "Please share it and I'll look it up right away!"
                )
            )
            return []

        logger.info("action_check_order_status | order_id=%s", order_id)
        order = _fetch_order(order_id)

        STATUS_ICON = {
            "Confirmed":   "✅",
            "Processing":  "⚙️",
            "Shipped":     "🚚",
            "Delivered":   "✅",
        }

        if order:
            icon = STATUS_ICON.get(order["status"], "🔍")
            msg  = (
                f"{icon} **Order #{order_id}**\n\n"
                f"📦 Status: **{order['status']}**\n"
                f"🚛 Carrier: {order['carrier']}\n"
                f"🔢 Tracking No.: {order['tracking']}\n"
                f"📅 ETA: {order['eta']}\n"
                f"📍 Step: {order['step']}\n\n"
                f"Track live on your carrier's website using the tracking number above."
            )
        else:
            msg = (
                f"❌ Order **#{order_id}** not found in our system.\n\n"
                f"Please double-check the Order ID in your confirmation email/SMS. "
                f"Need more help? Call our support: **1800-XXX-XXXX** (Toll Free, 9AM–9PM)."
            )

        dispatcher.utter_message(text=msg)
        return [SlotSet("order_id", order_id)]


# ============================================================
# ACTION: action_find_nearest_store
# ============================================================

class ActionFindNearestStore(Action):
    """Finds Calisto stores in the user's city."""

    def name(self) -> Text:
        return "action_find_nearest_store"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:

        city = tracker.get_slot("city")

        # Fallback: scan latest message for a known city name
        if not city:
            text = tracker.latest_message.get("text", "")
            city = self._detect_city(text)

        if not city:
            dispatcher.utter_message(text="Which city are you in? 🏙️ I'll find your nearest Calisto store.")
            return []

        logger.info("action_find_nearest_store | city=%s", city)
        stores = _fetch_stores(city)

        if stores:
            lines = [f"🏪 **Calisto Stores in {city.title()}:**\n"]
            for i, s in enumerate(stores, 1):
                lines.append(
                    f"{i}. **{s['name']}**\n"
                    f"   📍 {s['address']}\n"
                    f"   📞 {s['phone']}\n"
                    f"   🕐 {s['hours']}\n"
                )
            lines.append("We recommend calling ahead to confirm frame availability. Would you like to book an eye test there? 😊")
            dispatcher.utter_message(text="\n".join(lines))
        else:
            dispatcher.utter_message(
                text=(
                    f"We don't have a store in **{city.title()}** yet — but we're growing fast! 😊\n\n"
                    f"In the meantime:\n"
                    f"• 🛒 **Shop Online:** www.calisto.com (Free shipping + easy returns)\n"
                    f"• 🏠 **Home Trial:** We deliver 5 frames to try at home — no cost!\n"
                    f"• 📞 **Support:** 1800-XXX-XXXX (9AM–9PM)\n\n"
                    f"Current stores: Mumbai · Delhi · Bangalore · Chennai · Hyderabad · Pune"
                )
            )

        return [SlotSet("city", city.title())]

    @staticmethod
    def _detect_city(text: str) -> Optional[str]:
        for key in STORE_DATABASE:
            if key in text.lower():
                return key.title()
        return None


# ============================================================
# FORM VALIDATOR: frame_search_form
# ============================================================

class ValidateFrameSearchForm(FormValidationAction):
    """Validates and normalises slots for frame_search_form."""

    def name(self) -> Text:
        return "validate_frame_search_form"

    def validate_gender(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if slot_value:
            normalised = _normalise_gender(slot_value)
            return {"gender": normalised}
        return {"gender": slot_value}

    def validate_budget(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if slot_value:
            value = _parse_budget(slot_value)
            if value:
                return {"budget": str(value)}
        return {"budget": slot_value}

    def validate_frame_style(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        known = list(FRAME_CATALOG.keys())
        if slot_value and any(k in slot_value.lower() for k in known):
            return {"frame_style": slot_value}
        return {"frame_style": slot_value}


# ============================================================
# FORM VALIDATOR: order_tracking_form
# ============================================================

class ValidateOrderTrackingForm(FormValidationAction):
    """Validates order_id format in order_tracking_form."""

    def name(self) -> Text:
        return "validate_order_tracking_form"

    def validate_order_id(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if slot_value:
            cleaned = str(slot_value).strip().upper()
            # Accept standard formats
            if re.match(r"^(CAL-\d{4}-\d{4}|[A-Z]{0,3}\d{5,10})$", cleaned):
                return {"order_id": cleaned}
            # Try to extract from verbose input
            m = re.search(r"\b(CAL-\d{4}-\d{4}|[A-Za-z]{0,3}\d{5,10})\b", str(slot_value))
            if m:
                return {"order_id": m.group(1).upper()}
        dispatcher.utter_message(
            text=(
                "That doesn't look like a valid Order ID. "
                "Expected format: `45821`, `ORD12345`, or `CAL-2024-9876`."
            )
        )
        return {"order_id": None}


# ============================================================
# FORM VALIDATOR: eye_test_form
# ============================================================

class ValidateEyeTestForm(FormValidationAction):
    """Validates slots for the eye test booking form."""

    def name(self) -> Text:
        return "validate_eye_test_form"

    def validate_city(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if not slot_value:
            return {"city": None}

        stores = _fetch_stores(slot_value)
        if stores:
            dispatcher.utter_message(
                text=f"Great! We have a Calisto store in **{slot_value.title()}**. "
                     f"Let's book your eye test there. 👓"
            )
            return {"city": slot_value.title()}

        dispatcher.utter_message(
            text=(
                f"Sorry, no store in **{slot_value.title()}** yet. "
                f"We're available in: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune. "
                f"Which city works for you?"
            )
        )
        return {"city": None}

    def validate_appointment_date(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if slot_value and str(slot_value).strip():
            return {"appointment_date": slot_value}
        dispatcher.utter_message(text="Please provide a valid date (e.g. 15 March, next Monday).")
        return {"appointment_date": None}

    def validate_appointment_time(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if slot_value and str(slot_value).strip():
            return {"appointment_time": slot_value}
        dispatcher.utter_message(text="Please provide a valid time (e.g. 10:00 AM, 2:30 PM).")
        return {"appointment_time": None}
