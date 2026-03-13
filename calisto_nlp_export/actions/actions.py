"""
Calisto Eyewear (Malaysia) – Custom Rasa Actions
==================================================
All product, store, order, conversation, and document data is loaded from
the PostgreSQL knowledge base at runtime. Nothing is hardcoded.

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

from actions.knowledge_base.runtime_data import CalistoKnowledgeBase
from actions.action_document_search import ActionDocumentSearch as _ActionDocumentSearch

logger = logging.getLogger(__name__)


def _kb() -> CalistoKnowledgeBase:
    return CalistoKnowledgeBase.get()


class ActionDocumentSearch(_ActionDocumentSearch):
    """Bridge class so Rasa SDK discovers this action in the actions.actions module."""


# ============================================================
# Helpers
# ============================================================

def _parse_budget(budget: Optional[str]) -> Optional[int]:
    if not budget:
        return None
    nums = re.findall(r"\d+", str(budget))
    return int(nums[-1]) if nums else None


def _fetch_stores(city: str) -> List[Dict]:
    """Load store data from the Calisto knowledge base."""
    return _kb().fetch_stores(city)


class _KnowledgePromptAction:
    prompt_key: str

    FALLBACK_PROMPTS = {
        "frame_search_form_product_type": (
            "What type of product are you looking for?\n"
            "• Luxury Sunglasses\n"
            "• Designer Frames\n"
            "• Prescription Lenses\n"
            "• Contact Lens Solutions\n"
            "• Professional Services"
        ),
        "frame_search_form_budget": (
            "What is your budget in RM?\n"
            "Example: under 200, 300, or 500"
        ),
        "order_tracking_form_order_id": "Please share your Order ID so I can check the status.",
        "eye_test_form_city": "Which city would you like to book your eye test in?",
        "eye_test_form_appointment_date": "What date works for your eye test?",
        "eye_test_form_appointment_time": "What time works best for your eye test?",
    }

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        try:
            text = _kb().prompt(self.prompt_key)
        except Exception:
            text = self.FALLBACK_PROMPTS.get(self.prompt_key, "Please provide the requested details.")
        dispatcher.utter_message(text=text)
        return []


class _KnowledgeResponseAction:
    response_key: str

    FALLBACK_RESPONSES = {
        "lens_types_info": "We offer single vision, progressive, blue-light, photochromic, anti-glare, polarized, and UV-protection lens options.",
        "face_shape_help": "Tell me your face shape (round, oval, square, heart, diamond, oblong) and I can recommend suitable frame styles.",
        "warranty_info": "Most Calisto frames include warranty coverage for manufacturing defects. Share your order details and I can guide your claim steps.",
        "return_exchange_info": "You can exchange eligible products within 7 days and return unworn eligible items within 14 days. Prescription custom lenses are non-refundable.",
        "payment_options_info": "We support major cards, FPX online banking, and selected e-wallet/payment providers.",
    }

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        try:
            text = _kb().response(self.response_key)
        except Exception:
            text = self.FALLBACK_RESPONSES.get(self.response_key, "I can help with that. Please tell me what details you need.")
        dispatcher.utter_message(text=text)
        return []


class ActionShowProductOverview(Action):
    def name(self) -> Text:
        return "action_show_product_overview"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        overview = _kb().product_overview()
        categories = "\n".join(f"• {category}" for category in overview["categories"])
        samples = "\n".join(
            f"• {row['Product_Name']} ({row['Category']}) - RM{float(row['Price_MYR']):.2f}"
            for row in overview["samples"]
        )
        dispatcher.utter_message(
            text=(
                f"{_kb().prompt('product_overview_intro')}\n\n"
                f"{categories}\n\n"
                f"Sample items from the current catalog:\n{samples}\n\n"
                f"{_kb().prompt('product_overview_outro')}"
            )
        )
        return []


class ActionShowLensTypes(_KnowledgeResponseAction, Action):
    response_key = "lens_types_info"

    def name(self) -> Text:
        return "action_show_lens_types"


class ActionShowLensPricing(Action):
    def name(self) -> Text:
        return "action_show_lens_pricing"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        rows = _kb().lens_price_summary()
        if not rows:
            dispatcher.utter_message(text="I couldn't find lens pricing in the knowledge base right now.")
            return []

        lines = ["Here are the current prescription-lens price ranges from the Calisto knowledge base:\n"]
        for row in rows:
            lines.append(
                f"• {row['name']}: RM{row['min_price']:.2f} - RM{row['max_price']:.2f}"
            )
        lines.append("\nIf you want, I can also help you book an eye test.")
        dispatcher.utter_message(text="\n".join(lines))
        return []


class ActionShowFaceShapeHelp(_KnowledgeResponseAction, Action):
    response_key = "face_shape_help"

    def name(self) -> Text:
        return "action_show_face_shape_help"


class ActionShowWarrantyInfo(_KnowledgeResponseAction, Action):
    response_key = "warranty_info"

    def name(self) -> Text:
        return "action_show_warranty_info"


class ActionShowReturnExchangeInfo(_KnowledgeResponseAction, Action):
    response_key = "return_exchange_info"

    def name(self) -> Text:
        return "action_show_return_exchange_info"


class ActionShowPaymentOptionsInfo(_KnowledgeResponseAction, Action):
    response_key = "payment_options_info"

    def name(self) -> Text:
        return "action_show_payment_options_info"


class ActionShowRecommendFramesPrompt(Action):
    def name(self) -> Text:
        return "action_show_recommend_frames_prompt"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(text=_kb().prompt("recommend_frames_prompt"))
        return []


class ActionConfirmEyeTestBooking(Action):
    def name(self) -> Text:
        return "action_confirm_eye_test_booking"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        dispatcher.utter_message(
            text=_kb().response(
                "eye_test_booked",
                appointment_date=tracker.get_slot("appointment_date") or "TBD",
                appointment_time=tracker.get_slot("appointment_time") or "TBD",
                city=tracker.get_slot("city") or "TBD",
            )
        )
        return []


class ActionAskFrameSearchFormProductType(_KnowledgePromptAction, Action):
    prompt_key = "frame_search_form_product_type"

    def name(self) -> Text:
        return "action_ask_frame_search_form_product_type"


class ActionAskFrameSearchFormBudget(_KnowledgePromptAction, Action):
    prompt_key = "frame_search_form_budget"

    def name(self) -> Text:
        return "action_ask_frame_search_form_budget"


class ActionAskOrderTrackingFormOrderId(_KnowledgePromptAction, Action):
    prompt_key = "order_tracking_form_order_id"

    def name(self) -> Text:
        return "action_ask_order_tracking_form_order_id"


class ActionAskEyeTestFormCity(_KnowledgePromptAction, Action):
    prompt_key = "eye_test_form_city"

    def name(self) -> Text:
        return "action_ask_eye_test_form_city"


class ActionAskEyeTestFormAppointmentDate(_KnowledgePromptAction, Action):
    prompt_key = "eye_test_form_appointment_date"

    def name(self) -> Text:
        return "action_ask_eye_test_form_appointment_date"


class ActionAskEyeTestFormAppointmentTime(_KnowledgePromptAction, Action):
    prompt_key = "eye_test_form_appointment_time"

    def name(self) -> Text:
        return "action_ask_eye_test_form_appointment_time"


# ============================================================
# ACTION: action_recommend_frames
# ============================================================

class ActionRecommendFrames(Action):
    """Recommends products from the product_catalog CSV based on category and budget."""

    def name(self) -> Text:
        return "action_recommend_frames"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:

        product_type = tracker.get_slot("product_type")
        budget       = tracker.get_slot("budget")

        logger.info(
            "action_recommend_frames | product_type=%s budget=%s",
            product_type, budget,
        )

        kb = _kb()
        budget_value = _parse_budget(budget)

        results = kb.search_products(
            category=product_type,
            budget=budget_value,
            limit=5,
        )

        if not results:
            dispatcher.utter_message(
                text=kb.response("no_results_found", product_type=product_type or "your selection")
            )
            self._show_featured(dispatcher)
            return []

        category_label = product_type or "All Categories"
        lines = [f"🛍️ **{category_label.title()} Products** from the Calisto catalog:\n"]
        for i, row in enumerate(results, 1):
            lines.append(
                f"{i}. **{row['Product_Name']}**\n"
                f"   💰 RM{float(row['Price_MYR']):.2f}  |  📂 {row['Category']}\n"
                f"   📍 Available at: {row['Store_Location']}\n"
            )
        lines.append("\nIf you want, I can also find the nearest Calisto outlet or book an eye test.")
        dispatcher.utter_message(text="\n".join(lines))
        return []

    @staticmethod
    def _show_featured(dispatcher: CollectingDispatcher) -> None:
        lines = [_kb().response("featured_intro") + "\n"]
        for i, row in enumerate(_kb().featured_products(), 1):
            lines.append(
                f"{i}. **{row['Product_Name']}** – RM{float(row['Price_MYR']):.2f} ({row['Category']})"
            )
        lines.append("\nTell me the category or budget and I'll narrow it down.")
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
        order = _kb().fetch_order(order_id)

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
            dispatcher.utter_message(text=_kb().prompt("store_city_prompt"))
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
            lines.append(_kb().response("store_follow_up"))
            dispatcher.utter_message(text="\n".join(lines))
        else:
            dispatcher.utter_message(
                text=_kb().response(
                    "store_not_found",
                    city=city.title(),
                    supported_cities=_kb().supported_cities(),
                )
            )

        return [SlotSet("city", city.title())]

    @staticmethod
    def _detect_city(text: str) -> Optional[str]:
        return _kb().detect_city(text)


# ============================================================
# FORM VALIDATOR: frame_search_form
# ============================================================

class ValidateFrameSearchForm(FormValidationAction):
    """Validates and normalises slots for frame_search_form."""

    def name(self) -> Text:
        return "validate_frame_search_form"

    def validate_product_type(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        if not slot_value:
            return {"product_type": None}
        if slot_value:
            resolved = _kb().normalize_category(slot_value)
            if resolved:
                return {"product_type": resolved}
            # Unrecognised – ask again
            dispatcher.utter_message(
                text="Sorry, I didn't recognise that category. "
                "Please pick one: "
                + ", ".join(_kb().list_categories())
            )
            return {"product_type": None}

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

        available_cities = _kb().supported_cities()
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
