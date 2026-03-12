"""
Calisto Eyewear (Malaysia) – Custom Rasa Actions
==================================================
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
from difflib import get_close_matches
from typing import Any, Dict, List, Optional, Text

from rasa_sdk import Action, FormValidationAction, Tracker
from rasa_sdk.events import SlotSet
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.types import DomainDict

logger = logging.getLogger(__name__)

# ============================================================
# Simulated Backend Data  (Malaysian context)
# In production replace each _fetch_* method with a real
# HTTP call to your order-management / product / store API.
# ============================================================

# ── Frame Catalogue (prices in RM) ──────────────────────────
FRAME_CATALOG: Dict[str, Dict[str, List[Dict]]] = {
    "round": {
        "men": [
            {"name": "Calisto Retro Round",   "price": 199, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-RR-M01"},
            {"name": "Calisto Classic Circle","price": 249, "material": "Metal",           "color": "Gold",      "sku": "CAL-CC-M02"},
            {"name": "Calisto Vintage Round", "price": 149, "material": "TR90",            "color": "Black",     "sku": "CAL-VR-M03"},
        ],
        "women": [
            {"name": "Calisto Chic Round",    "price": 219, "material": "Acetate",        "color": "Rose Gold", "sku": "CAL-CR-W01"},
            {"name": "Calisto Elegant Circle","price": 299, "material": "Premium Metal",  "color": "Silver",    "sku": "CAL-EC-W02"},
            {"name": "Calisto Petite Round",  "price": 179, "material": "TR90",            "color": "Purple",    "sku": "CAL-PR-W03"},
        ],
        "unisex": [
            {"name": "Calisto Neo Round",     "price": 169, "material": "TR90",            "color": "Matte Black","sku": "CAL-NR-U01"},
        ],
    },
    "rectangular": {
        "men": [
            {"name": "Calisto Pro Rectangle", "price": 229, "material": "Titanium",       "color": "Gunmetal",  "sku": "CAL-PR-M01"},
            {"name": "Calisto Sharp Edge",    "price": 189, "material": "Acetate",        "color": "Dark Brown","sku": "CAL-SE-M02"},
        ],
        "women": [
            {"name": "Calisto Slim Rectangle","price": 199, "material": "Metal",           "color": "Rose Gold", "sku": "CAL-SR-W01"},
        ],
        "unisex": [
            {"name": "Calisto Classic Rect",  "price": 149, "material": "TR90",            "color": "Black",     "sku": "CAL-CR-U01"},
        ],
    },
    "square": {
        "men": [
            {"name": "Calisto Bold Square",   "price": 249, "material": "Acetate",        "color": "Black",     "sku": "CAL-BS-M01"},
            {"name": "Calisto Power Square",  "price": 199, "material": "Metal",           "color": "Silver",    "sku": "CAL-PS-M02"},
        ],
        "women": [
            {"name": "Calisto Fierce Square", "price": 229, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-FS-W01"},
        ],
        "unisex": [
            {"name": "Calisto Urban Square",  "price": 179, "material": "TR90",            "color": "Blue",      "sku": "CAL-US-U01"},
        ],
    },
    "cat-eye": {
        "men": [],
        "women": [
            {"name": "Calisto Glamour Cat-Eye","price": 279, "material": "Acetate",       "color": "Cherry Red","sku": "CAL-GC-W01"},
            {"name": "Calisto Retro Cat-Eye", "price": 229, "material": "Acetate",        "color": "Black-Gold","sku": "CAL-RC-W02"},
            {"name": "Calisto Chic Cat-Eye",  "price": 199, "material": "TR90",            "color": "Leopard",   "sku": "CAL-CC-W03"},
        ],
        "unisex": [
            {"name": "Calisto Modern Cat-Eye","price": 219, "material": "Metal",          "color": "Rose Gold", "sku": "CAL-MC-U01"},
        ],
    },
    "aviator": {
        "men": [
            {"name": "Calisto Ace Aviator",   "price": 199, "material": "Metal",           "color": "Gold",      "sku": "CAL-AA-M01"},
            {"name": "Calisto Sky Aviator",   "price": 249, "material": "Titanium",        "color": "Silver",    "sku": "CAL-SA-M02"},
        ],
        "women": [
            {"name": "Calisto Femme Aviator", "price": 219, "material": "Metal",           "color": "Rose Gold", "sku": "CAL-FA-W01"},
        ],
        "unisex": [
            {"name": "Calisto Classic Aviator","price": 169, "material": "Metal",          "color": "Gunmetal",  "sku": "CAL-CA-U01"},
        ],
    },
    "wayfarer": {
        "men": [
            {"name": "Calisto Street Wayfarer","price": 179, "material": "Acetate",       "color": "Black",     "sku": "CAL-SW-M01"},
        ],
        "women": [
            {"name": "Calisto Trend Wayfarer","price": 199, "material": "Acetate",        "color": "Tortoise",  "sku": "CAL-TW-W01"},
        ],
        "unisex": [
            {"name": "Calisto Original Wayfarer","price": 169,"material": "Acetate",      "color": "Classic Black","sku": "CAL-OW-U01"},
        ],
    },
    "oval": {
        "men": [
            {"name": "Calisto Smooth Oval",   "price": 189, "material": "TR90",            "color": "Brown",     "sku": "CAL-SO-M01"},
        ],
        "women": [
            {"name": "Calisto Dainty Oval",   "price": 209, "material": "Metal",           "color": "Gold",      "sku": "CAL-DO-W01"},
        ],
        "unisex": [
            {"name": "Calisto Neo Oval",       "price": 159, "material": "TR90",            "color": "Black",     "sku": "CAL-NO-U01"},
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
    # Malay synonyms map to same styles
    "bulat":   ["rectangular", "square", "wayfarer"],
    "persegi": ["round", "oval", "cat-eye"],
}

FEATURED_FRAMES = [
    {"name": "Calisto Ace Aviator",    "price": 199, "material": "Metal",   "sku": "CAL-AA-M01"},
    {"name": "Calisto Chic Round",     "price": 219, "material": "Acetate", "sku": "CAL-CR-W01"},
    {"name": "Calisto Bold Square",    "price": 249, "material": "Acetate", "sku": "CAL-BS-M01"},
    {"name": "Calisto Classic Aviator","price": 169, "material": "Metal",   "sku": "CAL-CA-U01"},
]

# ── Order Database ───────────────────────────────────────────
ORDER_DATABASE: Dict[str, Dict] = {
    "45821":          {"status": "Shipped",    "carrier": "J&T Express",  "tracking": "JT78234561MY",  "eta": "2 days",    "step": "Out for Delivery"},
    "ORD12345":       {"status": "Processing", "carrier": "N/A",          "tracking": "N/A",            "eta": "5-7 days",  "step": "Quality Check in Progress"},
    "78562":          {"status": "Delivered",  "carrier": "Pos Laju",     "tracking": "EN098765432MY",  "eta": "Delivered", "step": "Delivered on 5 March 2026"},
    "CAL-2024-9876":  {"status": "Shipped",    "carrier": "Ninja Van",    "tracking": "NVMY12345",      "eta": "3 days",    "step": "In Transit - KL Hub"},
    "CAL98231":       {"status": "Confirmed",  "carrier": "N/A",          "tracking": "N/A",            "eta": "7-10 days", "step": "Being Prepared at Warehouse"},
    "ORD98765":       {"status": "Shipped",    "carrier": "J&T Express",  "tracking": "JT99112233MY",   "eta": "1 day",     "step": "Out for Delivery"},
    "234567":         {"status": "Processing", "carrier": "N/A",          "tracking": "N/A",            "eta": "6-8 days",  "step": "Payment Confirmed"},
}

# ── Store Database (Malaysian locations) ─────────────────────
STORE_DATABASE: Dict[str, List[Dict]] = {
    "kuala lumpur": [
        {"name": "Calisto – Pavilion KL",        "address": "Lot 3.12, Level 3, Pavilion KL, 168 Jalan Bukit Bintang, 55100 KL",           "phone": "+60 3-2110-1234", "hours": "Mon-Sun: 10AM-10PM"},
        {"name": "Calisto – Mid Valley Megamall", "address": "Lot S-025, Level S, Mid Valley Megamall, Lingkaran Syed Putra, 59200 KL",     "phone": "+60 3-2282-5678", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "kl": [
        {"name": "Calisto – Pavilion KL",        "address": "Lot 3.12, Level 3, Pavilion KL, 168 Jalan Bukit Bintang, 55100 KL",           "phone": "+60 3-2110-1234", "hours": "Mon-Sun: 10AM-10PM"},
        {"name": "Calisto – Mid Valley Megamall", "address": "Lot S-025, Level S, Mid Valley Megamall, Lingkaran Syed Putra, 59200 KL",     "phone": "+60 3-2282-5678", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "bukit bintang": [
        {"name": "Calisto – Pavilion KL",        "address": "Lot 3.12, Level 3, Pavilion KL, 168 Jalan Bukit Bintang, 55100 KL",           "phone": "+60 3-2110-1234", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "klcc": [
        {"name": "Calisto – Suria KLCC",         "address": "Lot 221, Level 2, Suria KLCC, Jalan Ampang, 50088 KL",                         "phone": "+60 3-2161-9012", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "bangsar": [
        {"name": "Calisto – Bangsar Village II", "address": "Lot G-15, Ground Floor, Bangsar Village II, Jalan Telawi, 59100 KL",           "phone": "+60 3-2287-3456", "hours": "Mon-Sun: 10AM-9PM"},
    ],
    "mid valley": [
        {"name": "Calisto – Mid Valley Megamall", "address": "Lot S-025, Level S, Mid Valley Megamall, Lingkaran Syed Putra, 59200 KL",     "phone": "+60 3-2282-5678", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "pavilion": [
        {"name": "Calisto – Pavilion KL",        "address": "Lot 3.12, Level 3, Pavilion KL, 168 Jalan Bukit Bintang, 55100 KL",           "phone": "+60 3-2110-1234", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "petaling jaya": [
        {"name": "Calisto – One Utama",          "address": "Lot LG-313, LG Floor, 1 Utama Shopping Centre, Bandar Utama, 47800 PJ",       "phone": "+60 3-7722-7890", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "pj": [
        {"name": "Calisto – One Utama",          "address": "Lot LG-313, LG Floor, 1 Utama Shopping Centre, Bandar Utama, 47800 PJ",       "phone": "+60 3-7722-7890", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "one utama": [
        {"name": "Calisto – One Utama",          "address": "Lot LG-313, LG Floor, 1 Utama Shopping Centre, Bandar Utama, 47800 PJ",       "phone": "+60 3-7722-7890", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "subang jaya": [
        {"name": "Calisto – Sunway Pyramid",     "address": "Lot LG1.89, LG1 Floor, Sunway Pyramid, 3 Jalan PJS 11/15, 47500 Subang Jaya", "phone": "+60 3-5612-6789", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "sunway": [
        {"name": "Calisto – Sunway Pyramid",     "address": "Lot LG1.89, LG1 Floor, Sunway Pyramid, 3 Jalan PJS 11/15, 47500 Subang Jaya", "phone": "+60 3-5612-6789", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "shah alam": [
        {"name": "Calisto – AEON Shah Alam",     "address": "Lot 2F-18, Level 2, AEON Mall Shah Alam, Seksyen 13, 40100 Shah Alam",         "phone": "+60 3-5519-4567", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "penang": [
        {"name": "Calisto – Gurney Plaza",       "address": "Lot 170-G-43, Gurney Plaza, Persiaran Gurney, 10250 Georgetown, Penang",       "phone": "+60 4-228-1234", "hours": "Mon-Sun: 10AM-9:30PM"},
        {"name": "Calisto – Queensbay Mall",     "address": "Lot LG-39, Queensbay Mall, 100 Persiaran Bayan Indah, 11900 Bayan Lepas",      "phone": "+60 4-645-5678", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "georgetown": [
        {"name": "Calisto – Gurney Plaza",       "address": "Lot 170-G-43, Gurney Plaza, Persiaran Gurney, 10250 Georgetown, Penang",       "phone": "+60 4-228-1234", "hours": "Mon-Sun: 10AM-9:30PM"},
    ],
    "gurney plaza": [
        {"name": "Calisto – Gurney Plaza",       "address": "Lot 170-G-43, Gurney Plaza, Persiaran Gurney, 10250 Georgetown, Penang",       "phone": "+60 4-228-1234", "hours": "Mon-Sun: 10AM-9:30PM"},
    ],
    "johor bahru": [
        {"name": "Calisto – Mid Valley Southkey","address": "Lot G-023, Ground Floor, Mid Valley Southkey, Persiaran Southkey, 80150 JB",   "phone": "+60 7-338-9012", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "jb": [
        {"name": "Calisto – Mid Valley Southkey","address": "Lot G-023, Ground Floor, Mid Valley Southkey, Persiaran Southkey, 80150 JB",   "phone": "+60 7-338-9012", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "ipoh": [
        {"name": "Calisto – Ipoh Parade",        "address": "Lot LG-15, LG Floor, Ipoh Parade Mall, 105 Jalan Sultan Abdul Jalil, 30300 Ipoh","phone": "+60 5-255-3456", "hours": "Mon-Sun: 10AM-9PM"},
    ],
    "melaka": [
        {"name": "Calisto – Dataran Pahlawan",   "address": "Lot L1-28, Level 1, Dataran Pahlawan Megamall, Jalan Merdeka, 75000 Melaka",   "phone": "+60 6-281-7890", "hours": "Mon-Sun: 10AM-10PM"},
    ],
    "kota kinabalu": [
        {"name": "Calisto – Suria Sabah",        "address": "Lot L2-07, Level 2, Suria Sabah, 1 Jalan Tun Fuad Stephens, 88000 KK",        "phone": "+60 88-251-234", "hours": "Mon-Sun: 10AM-9:30PM"},
    ],
    "kuching": [
        {"name": "Calisto – Vivacity Megamall",  "address": "Lot G-10, Ground Floor, Vivacity Megamall, Jalan Wan Alwi, 93350 Kuching",     "phone": "+60 82-367-567", "hours": "Mon-Sun: 10AM-10PM"},
    ],
}

# City aliases / fuzzy matching map
CITY_ALIASES: Dict[str, str] = {
    "kuala lumpur": "kuala lumpur",
    "kl": "kuala lumpur",
    "bukit bintang": "bukit bintang",
    "klcc": "klcc",
    "bangsar": "bangsar",
    "mid valley": "mid valley",
    "pavilion": "pavilion",
    "petaling jaya": "petaling jaya",
    "pj": "petaling jaya",
    "one utama": "one utama",
    "subang jaya": "subang jaya",
    "sunway": "sunway",
    "shah alam": "shah alam",
    "setia alam": "shah alam",
    "penang": "penang",
    "georgetown": "georgetown",
    "gurney plaza": "gurney plaza",
    "johor bahru": "johor bahru",
    "jb": "johor bahru",
    "johor": "johor bahru",
    "ipoh": "ipoh",
    "melaka": "melaka",
    "malacca": "melaka",
    "kota kinabalu": "kota kinabalu",
    "kk": "kota kinabalu",
    "kuching": "kuching",
    "cyberjaya": "kuala lumpur",
    "putrajaya": "kuala lumpur",
    "seremban": "melaka",
}


# ============================================================
# Helpers
# ============================================================

def _normalise_gender(gender: Optional[str]) -> str:
    if not gender:
        return "unisex"
    g = gender.lower().strip()
    if any(k in g for k in ("men", "male", "gents", "man", "lelaki", "jantan")):
        return "men"
    if any(k in g for k in ("women", "female", "ladies", "woman", "perempuan", "wanita")):
        return "women"
    return "unisex"


def _parse_budget(budget: Optional[str]) -> Optional[int]:
    if not budget:
        return None
    nums = re.findall(r"\d+", str(budget))
    return int(nums[-1]) if nums else None


def _fetch_order(order_id: str) -> Optional[Dict]:
    """Simulate an order-management API lookup."""
    key = order_id.strip().upper()
    return ORDER_DATABASE.get(key) or ORDER_DATABASE.get(order_id.strip())


def _fetch_stores(city: str) -> List[Dict]:
    """Simulate a store-locator API lookup with fuzzy matching."""
    city_lower = city.lower().strip()

    # Direct lookup
    if city_lower in STORE_DATABASE:
        return STORE_DATABASE[city_lower]

    # Alias lookup
    if city_lower in CITY_ALIASES:
        alias = CITY_ALIASES[city_lower]
        if alias in STORE_DATABASE:
            return STORE_DATABASE[alias]

    # Partial match
    for key, stores in STORE_DATABASE.items():
        if key in city_lower or city_lower in key:
            return stores

    # Fuzzy match against all known keys (aliases + store keys)
    all_keys = list(CITY_ALIASES.keys()) + list(STORE_DATABASE.keys())
    matches = get_close_matches(city_lower, all_keys, n=1, cutoff=0.6)
    if matches:
        matched = matches[0]
        resolved = CITY_ALIASES.get(matched, matched)
        if resolved in STORE_DATABASE:
            return STORE_DATABASE[resolved]

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
                        f"Hmm, no **{frame_style}** frames exactly within RM{budget_value} right now. "
                        f"Here are the closest options:"
                    )
                )

        results = candidates[:3]
        lines   = [f"👓 **{frame_style.title()} Frames** from Calisto:\n"]
        for i, f in enumerate(results, 1):
            lines.append(
                f"{i}. **{f['name']}**\n"
                f"   💰 RM{f['price']}  |  🔧 {f['material']}  |  🎨 {f['color']}\n"
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
            lines.append(f"{i}. **{f['name']}** – RM{f['price']} ({f['material']})  |  SKU: {f['sku']}")
        lines.append("\nShop online at **www.calisto.com.my** or visit our store!")
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
                    "Please share it and I'll check terus!"
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
                f"Need more help? WhatsApp us: **+60 12-XXX-XXXX** or call **1-800-XX-XXXX** (Toll Free, 9AM-9PM)."
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
            dispatcher.utter_message(text="Kat mana you sekarang? / Which city are you in? 🏙️ I'll find your nearest Calisto store.")
            return []

        logger.info("action_find_nearest_store | city=%s", city)
        stores = _fetch_stores(city)

        if stores:
            lines = [f"🏪 **Calisto Stores near {city.title()}:**\n"]
            for i, s in enumerate(stores, 1):
                lines.append(
                    f"{i}. **{s['name']}**\n"
                    f"   📍 {s['address']}\n"
                    f"   📞 {s['phone']}\n"
                    f"   🕐 {s['hours']}\n"
                )
            lines.append("We recommend calling ahead / WhatsApp to confirm frame availability. Nak book eye test kat situ? 😊")
            dispatcher.utter_message(text="\n".join(lines))
        else:
            dispatcher.utter_message(
                text=(
                    f"We don't have a store in **{city.title()}** yet — but we're growing fast! 😊\n\n"
                    f"In the meantime:\n"
                    f"• 🛒 **Shop Online:** www.calisto.com.my (Free shipping seluruh Malaysia!)\n"
                    f"• 🏠 **Home Trial:** We deliver 5 frames to try at home — no cost!\n"
                    f"• 📱 **WhatsApp:** +60 12-XXX-XXXX\n\n"
                    f"Current stores: KL · PJ · Subang · Shah Alam · Penang · JB · Ipoh · Melaka · KK · Kuching"
                )
            )

        return [SlotSet("city", city.title())]

    @staticmethod
    def _detect_city(text: str) -> Optional[str]:
        text_lower = text.lower()
        # Check aliases first (handles KL, PJ, JB, etc.)
        for alias, canonical in CITY_ALIASES.items():
            if alias in text_lower:
                return canonical.title()
        # Then check store database keys
        for key in STORE_DATABASE:
            if key in text_lower:
                return key.title()
        # Fuzzy match the whole input against known city names
        all_keys = list(CITY_ALIASES.keys()) + list(STORE_DATABASE.keys())
        matches = get_close_matches(text_lower.strip(), all_keys, n=1, cutoff=0.6)
        if matches:
            matched = matches[0]
            return CITY_ALIASES.get(matched, matched).title()
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

        available_cities = "KL, PJ, Subang Jaya, Shah Alam, Penang, JB, Ipoh, Melaka, KK, Kuching"
        dispatcher.utter_message(
            text=(
                f"Sorry, no store in **{slot_value.title()}** yet. "
                f"We're available in: {available_cities}. "
                f"Which city works for you? / Mana satu yang okay?"
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
        dispatcher.utter_message(text="Please provide a valid date (e.g. 15 March, next Monday, esok, Sabtu ni).")
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
        dispatcher.utter_message(text="Please provide a valid time (e.g. 10:00 AM, 2:30 PM / pukul 10 pagi).")
        return {"appointment_time": None}
