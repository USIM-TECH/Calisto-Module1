import logging
from typing import Any, Dict, Text
from rasa_sdk import Tracker, FormValidationAction
from rasa_sdk.executor import CollectingDispatcher

from forms.validators import (
    normalize_free_text,
    normalize_name,
    is_valid_name,
    is_valid_phone,
    normalize_phone,
    is_valid_email,
    normalize_email,
    is_valid_location,
    is_valid_service,
    normalize_timeline,
)
from nlp.city_resolver import resolve_city, is_probable_location
from config.settings import FORM_INTERRUPTION_INTENTS, INTENT_CONFIDENCE_THRESHOLD
from actions.utils import (
    get_latest_intent,
    detect_support_intent,
    resolve_interruption_flow,
    get_language,
    tr,
)

logger = logging.getLogger(__name__)


class ValidateLeadCaptureForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_lead_capture_form"

    async def required_slots(self, domain_slots, dispatcher, tracker, domain):
        """Return required slots based on flow type.
        
        For support flows, only require name and phone.
        For other flows, require all fields.
        """
        current_flow = str(tracker.get_slot("current_flow") or "").strip()
        support_case_type = str(tracker.get_slot("support_case_type") or "").strip()
        
        # If this is a support flow, only require critical contact info
        if current_flow == "support_flow" or support_case_type:
            return ["lead_name", "contact_number"]
        
        # For appointment/consultation flows, require all fields
        return ["lead_name", "contact_number", "email", "lead_location", "preferred_service", "purchase_timeline"]

    def _reject_slot(
        self,
        slot_name: str,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        retry_text: str,
    ) -> Dict[Text, Any]:
        intent = get_latest_intent(tracker)
        requested_slot = tracker.get_slot("requested_slot") or slot_name
        support_intent, _override_reason, _keyword_match = detect_support_intent(tracker)

        # Check for domain switch or strong intent interruption
        if support_intent or (intent["name"] in FORM_INTERRUPTION_INTENTS and intent["confidence"] >= INTENT_CONFIDENCE_THRESHOLD):
            # Exit form immediately without filling - leave as "Not provided"
            return {
                slot_name: None,
                "requested_slot": None,
                "current_flow": resolve_interruption_flow(tracker, intent["name"]),
                "form_interrupted": True,
            }

        # Count how many times bot has asked for this slot (search full history)
        ask_count = 0
        for event in tracker.events:
            if event.get("event") == "action" and event.get("name") == f"utter_ask_{requested_slot}":
                ask_count += 1
            if event.get("event") == "bot":
                metadata_action = event.get("metadata", {}).get("utter_action", "")
                if metadata_action == f"utter_ask_{requested_slot}":
                    ask_count += 1

        if ask_count >= 2:
            logger.info("[FORM] slot=%s asked %d times, skipping", requested_slot, ask_count)
            lang = get_language(tracker)
            dispatcher.utter_message(text=tr(
                lang,
                "No worries, let's continue.",
                "Tidak mengapa, mari teruskan.",
                "没关系，我们继续。",
            ))
            return {slot_name: "skipped"}

        dispatcher.utter_message(text=retry_text)
        dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
        return {slot_name: None}

    async def validate_lead_name(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_name(slot_value)
        if not is_valid_name(value):
            return self._reject_slot(
                "lead_name",
                dispatcher,
                tracker,
                tr(lang,
                    "Please share your name only, without a product question or request.",
                    "Sila kongsi nama anda sahaja, tanpa soalan atau permintaan produk.",
                    "请只提供您的姓名，不要附带产品问题或请求。"),
            )
        return {"lead_name": value}

    async def validate_contact_number(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        if not is_valid_phone(slot_value):
            return self._reject_slot(
                "contact_number",
                dispatcher,
                tracker,
                tr(lang,
                    "Please provide a valid phone number including area or country code.",
                    "Sila berikan nombor telefon yang sah termasuk kod kawasan atau negara.",
                    "请输入有效的电话号码，并包含区号或国家代码。"),
            )
        return {"contact_number": normalize_phone(slot_value)}

    async def validate_email(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        if not is_valid_email(slot_value):
            return self._reject_slot(
                "email",
                dispatcher,
                tracker,
                tr(lang,
                    "Please provide a valid email address.",
                    "Sila berikan alamat e-mel yang sah.",
                    "请输入有效的电子邮箱地址。"),
            )
        return {"email": normalize_email(slot_value)}

    async def validate_lead_location(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        resolved_city = resolve_city(value)
        if resolved_city:
            return {"lead_location": resolved_city}

        if not is_valid_location(value) or not is_probable_location(value):
            return self._reject_slot(
                "lead_location",
                dispatcher,
                tracker,
                tr(lang,
                    "Please share your city or area so we can route your inquiry properly.",
                    "Sila kongsi bandar atau kawasan anda supaya kami boleh arahkan pertanyaan anda dengan betul.",
                    "请提供您所在的城市或区域，以便我们正确安排您的咨询。"),
            )
        return {"lead_location": value}

    async def validate_preferred_service(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        if not is_valid_service(value):
            return self._reject_slot(
                "preferred_service",
                dispatcher,
                tracker,
                tr(lang,
                    "Please tell us which product or service you are interested in.",
                    "Sila beritahu kami produk atau perkhidmatan yang anda minati.",
                    "请告诉我们您感兴趣的产品或服务。"),
            )
        return {"preferred_service": value}

    async def validate_purchase_timeline(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> Dict[Text, Any]:
        lang = get_language(tracker)
        value = normalize_free_text(slot_value)
        normalized = normalize_timeline(value)
        if normalized:
            return {"purchase_timeline": normalized}
        return self._reject_slot(
            "purchase_timeline",
            dispatcher,
            tracker,
            tr(lang,
                "Let me know if you are ready this week, within 2 weeks, or just exploring.",
                "Beritahu saya sama ada anda bersedia minggu ini, dalam 2 minggu, atau sekadar melihat-lihat.",
                "请告诉我您是本周决定、两周内决定，还是先看看。"),
        )
