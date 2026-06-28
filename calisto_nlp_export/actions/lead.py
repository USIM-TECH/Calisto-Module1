import logging
from typing import Any, Dict, List, Text, Optional
import re
from rasa_sdk import Action, Tracker
from rasa_sdk.events import SlotSet, FollowupAction, ActiveLoop
from rasa_sdk.executor import CollectingDispatcher
from actions.utils import *
from actions.utils import _SUPPORT_SERVICE_NAMES, _pick_completion_response
from nlp.city_resolver import resolve_city, is_probable_location
from forms.validators import *
from nlp.budget_parser import parse_budget_from_text
from config.settings import *
from config.constants import *
from config.regex_patterns import *
from search.filters import *
from search.formatters import *
from search.engine import rank_products_safely
from actions.products import ActionResetEyewearSlots, ActionShowPricing, ActionExplainLens, ActionFilterProducts, ActionSearchProductByAttribute, ActionRecommendProducts, ActionAskBrand, ActionFilterLenses
from actions.store import ActionAskCity, ActionFindStore, ActionHandleStoreHours
from actions.search import ActionSmartSearch

logger = logging.getLogger(__name__)

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
        events: List[Dict[Text, Any]] = flow_entry_events(tracker, "lead_capture")
        events.append(SlotSet("form_interrupted", None))

        slot_mappings = {
            "lead_name": metadata.get("senderName"),
            "contact_number": metadata.get("phone"),
            "email": metadata.get("email"),
            "lead_location": metadata.get("location"),
            "preferred_service": metadata.get("preferred_service") or infer_service_from_intent(tracker),
        }

        for slot_name, value in slot_mappings.items():
            if slot_name == "preferred_service":
                inferred = metadata.get("preferred_service") or infer_service_from_intent(tracker)
                if inferred:
                    events.append(SlotSet("preferred_service", inferred))
                    continue
            if tracker.get_slot(slot_name):
                continue
            normalized = str(value).strip() if isinstance(value, str) else ""
            if normalized:
                events.append(SlotSet(slot_name, normalized))
        return events


from forms.lead_form import ValidateLeadCaptureForm



class ActionHandleLeadCaptureInterruption(Action):
    def name(self) -> Text:
        return "action_handle_lead_capture_interruption"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        intent = get_latest_intent(tracker)
        requested_slot = str(tracker.get_slot("requested_slot") or "").strip()
        intent_name = intent["name"]
        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)

        # If the form misroutes a clean slot value here, capture it instead of
        # treating the turn as an interruption. This keeps lead collection
        # resilient when NLU confidence is low or the form policy loses the turn.
        normalized_text = normalize_free_text(raw_text)
        if requested_slot == "lead_name" and is_valid_name(normalize_name(normalized_text)):
            return [
                SlotSet("lead_name", normalize_name(normalized_text)),
                SlotSet("requested_slot", None),
                SlotSet("form_interrupted", None),
                FollowupAction("lead_capture_form"),
            ]
        if requested_slot == "contact_number" and is_valid_phone(normalized_text):
            return [
                SlotSet("contact_number", normalize_phone(normalized_text)),
                SlotSet("requested_slot", None),
                SlotSet("form_interrupted", None),
                FollowupAction("lead_capture_form"),
            ]
        if requested_slot == "email" and is_valid_email(normalized_text):
            return [
                SlotSet("email", normalize_email(normalized_text)),
                SlotSet("requested_slot", None),
                SlotSet("form_interrupted", None),
                FollowupAction("lead_capture_form"),
            ]
        if requested_slot == "lead_location":
            logger.info(f"[INTERRUPTION] lead_location slot, testing: {normalized_text}")
            resolved_city = resolve_city(normalized_text)
            logger.info(f"[INTERRUPTION] resolve_city returned: {resolved_city}")
            if resolved_city:
                logger.info(f"[INTERRUPTION] Capturing resolved city: {resolved_city}")
                return [
                    SlotSet("lead_location", resolved_city),
                    SlotSet("requested_slot", None),
                    SlotSet("form_interrupted", None),
                    FollowupAction("lead_capture_form"),
                ]
            if is_valid_location(normalized_text) and is_probable_location(normalized_text):
                logger.info(f"[INTERRUPTION] Capturing valid location: {normalized_text}")
                return [
                    SlotSet("lead_location", normalized_text),
                    SlotSet("requested_slot", None),
                    SlotSet("form_interrupted", None),
                    FollowupAction("lead_capture_form"),
                ]
        if requested_slot == "preferred_service" and is_valid_service(normalized_text):
            return [
                SlotSet("preferred_service", normalize_free_text(raw_text)),
                SlotSet("requested_slot", None),
                SlotSet("form_interrupted", None),
                FollowupAction("lead_capture_form"),
            ]
        if requested_slot == "purchase_timeline":
            normalized_timeline = normalize_timeline(normalized_text)
            if normalized_timeline:
                return [
                    SlotSet("purchase_timeline", normalized_timeline),
                    SlotSet("requested_slot", None),
                    SlotSet("form_interrupted", None),
                    FollowupAction("lead_capture_form"),
                ]

        switch = detect_domain_switch(tracker, intent_name, raw_text, support_intent)
        should_interrupt = bool(
            switch["detected"]
            or (intent_name in FORM_INTERRUPTION_INTENTS and intent["confidence"] >= INTENT_CONFIDENCE_THRESHOLD)
        )

        if not should_interrupt:
            dispatcher.utter_message(text=tr(lang, "I still need that detail to continue.", "Saya masih perlukan butiran itu untuk teruskan.", "我还需要这项信息才能继续。"))
            if requested_slot:
                dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
            return []

        # Exit form cleanly without auto-filling - leave fields as "Not provided"
        events: List[Dict[Text, Any]] = []
        
        if switch["detected"]:
            reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
            logger.info({
                "previous_intent": switch["previous_intent"],
                "new_intent": switch["new_intent"],
                "domain_switch_detected": True,
                "cleared_active_loop": cleared_active_loop,
                "cleared_slots": cleared_slots,
            })
            events.extend(reset_events)
            events.append(SlotSet("form_interrupted", True))
        else:
            events.extend([
                SlotSet("requested_slot", None),
                ActiveLoop(None),
                SlotSet("current_flow", resolve_interruption_flow(tracker, intent_name)),
                SlotSet("form_interrupted", True),
            ])

        if support_intent:
            logger.info({
                "intent": "lead_capture_interruption",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
            })
            events.extend(route_support_flow(dispatcher, tracker, support_intent))
            return events

        if switch["detected"] and switch["new_domain"] == "shopping":
            events.append(FollowupAction("action_reset_eyewear_slots"))
            return events
        if switch["detected"] and switch["new_domain"] == "lens":
            events.extend(ActionExplainLens().run(dispatcher, tracker, domain))
            return events

        if intent_name == "browse_eyewear":
            events.extend(ActionResetEyewearSlots().run(dispatcher, tracker, domain))
            dispatcher.utter_message(response="utter_ask_product_type")
        elif intent_name == "ask_pricing":
            dispatcher.utter_message(response="utter_pricing_intro")
        elif intent_name == "select_pricing_category":
            events.extend(ActionShowPricing().run(dispatcher, tracker, domain))
        elif intent_name in {"lens_vision_solutions", "ask_lens_type"}:
            if intent_name == "ask_lens_type":
                events.extend(ActionExplainLens().run(dispatcher, tracker, domain))
            else:
                dispatcher.utter_message(response="utter_ask_lens_type")
        elif intent_name == "find_a_store":
            events.extend(ActionAskCity().run(dispatcher, tracker, domain))
        elif intent_name == "choose_city":
            events.extend(ActionFindStore().run(dispatcher, tracker, domain))
        elif intent_name == "store_hours":
            events.extend(ActionHandleStoreHours().run(dispatcher, tracker, domain))
        elif intent_name == "search_product":
            events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "search_product_by_attribute":
            events.extend(ActionSearchProductByAttribute().run(dispatcher, tracker, domain))
        elif intent_name in {"product_recommendation", "inform_budget"}:
            events.extend(ActionRecommendProducts().run(dispatcher, tracker, domain))
        elif intent_name == "select_product_type":
            events.extend(ActionAskBrand().run(dispatcher, tracker, domain))
        elif intent_name == "select_brand":
            events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "select_budget":
            target_flow = resolve_interruption_flow(tracker, intent_name)
            if target_flow == "lens_consultation":
                events.extend(ActionFilterLenses().run(dispatcher, tracker, domain))
            else:
                events.extend(ActionFilterProducts().run(dispatcher, tracker, domain))
        elif intent_name == "ask_faq":
            events.append(FollowupAction("action_document_search"))
        elif intent_name == "email_support":
            dispatcher.utter_message(response="utter_email_support")
        else:
            if requested_slot:
                dispatcher.utter_message(response=f"utter_ask_{requested_slot}")
            return []

        return events



class ActionSubmitLeadCapture(Action):
    def name(self) -> Text:
        return "action_submit_lead_capture"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        
        # If form was interrupted, don't submit or show completion message
        if tracker.get_slot("form_interrupted"):
            logger.info("Form was interrupted - skipping lead submission")
            return [SlotSet("form_interrupted", None)]  # Clear the flag
        
        # tracker.latest_message at submission time is the user's last form
        # field value (e.g. purchase_timeline answer).  NLU classifies plain
        # text like that as nlu_fallback, which is not a useful signal.
        # Walk back through the event log to find the last real intent
        # (the one that triggered this support/booking flow).
        _raw_intent = tracker.latest_message.get("intent", {}).get("name") or ""
        
        # CRITICAL: Filter out ALL internal/form intents before storing as tag
        _SKIP_INTENTS = {
            "nlu_fallback", "out_of_scope", "session_start", "restart", 
            "back", "affirm", "deny", "stop", "", "inform",
            "share_name", "share_phone", "share_email",
            "share_location", "share_service_interest", "share_timeline"
        }
        
        if _raw_intent not in _SKIP_INTENTS:
            _resolved_intent = _raw_intent
        else:
            _resolved_intent = ""
            for _ev in reversed(tracker.events):
                if _ev.get("event") != "user":
                    continue
                _ev_intent = _ev.get("parse_data", {}).get("intent", {}).get("name") or ""
                if _ev_intent and _ev_intent not in _SKIP_INTENTS:
                    _resolved_intent = _ev_intent
                    break
        
        logger.info(f"[LEAD_SUBMIT] raw_intent={_raw_intent}, resolved_intent={_resolved_intent}")

        payload = {
            "name": tracker.get_slot("lead_name"),
            "phone": tracker.get_slot("contact_number"),
            "email": tracker.get_slot("email"),
            "location": tracker.get_slot("lead_location"),
            "preferred_service": tracker.get_slot("preferred_service") or tracker.get_slot("product_type"),
            "purchase_timeline": tracker.get_slot("purchase_timeline"),
            "order_id": tracker.get_slot("order_id"),
            "use_case": tracker.get_slot("use_case"),
            "urgency": tracker.get_slot("urgency"),
            "lead_status": tracker.get_slot("lead_status"),
            "latest_intent": _resolved_intent,
        }

        response = gateway.submit_lead(payload)
        status = tracker.get_slot("lead_status")
        preferred_service = str(payload.get("preferred_service") or "").strip()
        current_flow = str(tracker.get_slot("current_flow") or "").strip()
        latest_intent = str(payload.get("latest_intent") or "").strip()
        support_case_type = str(tracker.get_slot("support_case_type") or "").strip()
        is_support_case = bool(support_case_type) or preferred_service in _SUPPORT_SERVICE_NAMES

        if status == "qualified":
            booking_line = tr(
                lang,
                f"\nYou can also book directly here: {BOOKING_URL}" if BOOKING_URL else "",
                f"\nAnda juga boleh tempah terus di sini: {BOOKING_URL}" if BOOKING_URL else "",
                f"\n您也可以直接在这里预约：{BOOKING_URL}" if BOOKING_URL else "",
            )
            _qualified_en = random.choice([
                f"You're all set. Our team will confirm your appointment and share all the details shortly.{booking_line}",
                f"Your details are confirmed. Expect a personal follow-up from our team very soon.{booking_line}",
                f"All set. A Calisto specialist will be in touch to finalise everything for you.{booking_line}",
                f"Noted and confirmed. Our team will reach out shortly with your next steps.{booking_line}",
                f"Your request is locked in. Someone from our team will be in touch shortly to arrange everything.{booking_line}",
            ])
            dispatcher.utter_message(
                text=tr(
                    lang,
                    _qualified_en,
                    f"Terima kasih. Pasukan kami akan hubungi anda tidak lama lagi untuk mengesahkan temujanji anda.{booking_line}",
                    f"一切就绪。我们的团队将很快联系您，确认您的预约详情。{booking_line}"
                ),
                buttons=[
                    {"title": tr(lang, "Book Appointment", "Tempah Janji Temu", "预约"), "payload": "/book_appointment"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                ],
            )
        else:
            _en_text = _pick_completion_response(preferred_service, current_flow, latest_intent)
            if is_support_case:
                _ms_text = random.choice([
                    "Permintaan sokongan anda telah diterima. Pasukan kami akan menghubungi anda tidak lama lagi.",
                    "Maklumat kes anda telah dicatat. Pasukan sokongan kami akan berhubung dengan anda segera.",
                    "Terima kasih. Kami akan bantu susulan kes sokongan anda secepat mungkin.",
                    "Kes sokongan anda telah dihantar. Pasukan kami akan berhubung dengan anda tidak lama lagi.",
                    "Dicatat. Seorang ejen sokongan akan menghubungi anda secepat mungkin.",
                ])
                _zh_text = random.choice([
                    "您的支持请求已收到。我们的团队将尽快与您联系。",
                    "您的案件信息已记录。我们的支持团队会尽快跟进。",
                    "感谢您。我们会尽快处理您的支持请求。",
                    "支持案件已提交。我们的团队很快会联系您。",
                    "已记录。支持专员会尽快与您联系。",
                ])
            else:
                _ms_text = tr(
                    "ms",
                    _en_text,
                    random.choice([
                        "Permintaan anda telah diterima. Pasukan kami akan menghubungi anda tidak lama lagi.",
                        "Maklumat anda telah dicatat. Pasukan kami akan menghubungi anda dengan segera.",
                        "Terima kasih. Kami akan berikan maklum balas kepada anda tidak lama lagi.",
                        "Dicatat. Pasukan kami akan berhubung dengan anda tidak lama lagi.",
                        "Permohonan anda telah kami terima. Kami akan menghubungi anda dengan segera.",
                    ]),
                    "",
                )
                _zh_text = tr(
                    "zh",
                    _en_text,
                    "",
                    random.choice([
                        "您的请求已收到。我们的团队将尽快与您联系。",
                        "已记录您的信息。我们的团队将尽快跟进。",
                        "感谢您。我们会尽快回复您。",
                        "已收到。我们的团队很快会与您联系。",
                        "您的申请已提交。专员将尽快与您联系。",
                    ]),
                )

            support_buttons = [
                {"title": tr(lang, "Support & Policies", "Sokongan & Polisi", "支持与政策"), "payload": "/support_and_policies"},
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Ask Another Question", "Tanya Soalan Lain", "再问一个问题"), "payload": "/greet"},
            ]
            generic_buttons = [
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                {"title": tr(lang, "Ask Another Question", "Tanya Soalan Lain", "再问一个问题"), "payload": "/greet"},
            ]
            dispatcher.utter_message(
                text=tr(lang, _en_text, _ms_text, _zh_text),
                buttons=support_buttons if is_support_case else generic_buttons,
            )

        if response and response.get("lead_id"):
            dispatcher.utter_message(text=tr(lang, f"Reference ID: {response['lead_id']}", f"ID Rujukan: {response['lead_id']}", f"参考编号：{response['lead_id']}"))
            
        events = [SlotSet("current_flow", None), SlotSet("requested_slot", None)]
        if tracker.get_slot("support_case_type"):
            events.append(SlotSet("support_case_status", "open"))
            
        return events



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
