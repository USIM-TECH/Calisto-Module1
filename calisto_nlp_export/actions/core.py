import logging
from typing import Any, Dict, List, Text, Optional
import re
from rasa_sdk import Action, Tracker
from rasa_sdk.events import SlotSet, FollowupAction, ActiveLoop
from rasa_sdk.executor import CollectingDispatcher
from actions.utils import *
from nlp.city_resolver import resolve_city, is_probable_location
from forms.validators import *
from nlp.budget_parser import parse_budget_from_text
from config.settings import *
from config.constants import *
from config.regex_patterns import *
from search.filters import *
from search.formatters import *
from search.engine import rank_products_safely
from actions.search import ActionSmartSearch

logger = logging.getLogger(__name__)

class ActionSetLanguage(Action):
    def name(self) -> Text:
        return "action_set_language"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        current = str(tracker.get_slot("preferred_language") or "").strip().lower()
        detected = detect_language_from_text(tracker.latest_message.get("text") or "")
        if current in {"en", "ms", "zh"}:
            language = current
        else:
            language = detected or "en"
        return [SlotSet("preferred_language", language)]



class ActionDefaultFallback(Action):
    def name(self) -> Text:
        return "action_default_fallback"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        intent = get_latest_intent(tracker)
        intent_name = intent["name"]
        raw_text = tracker.latest_message.get("text") or ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            intent = get_latest_intent(tracker)
            switch = detect_domain_switch(tracker, intent["name"], raw_text, support_intent)
            reset_events: List[Dict[Text, Any]] = []
            if switch["detected"]:
                reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
                logger.info({
                    "previous_intent": switch["previous_intent"],
                    "new_intent": switch["new_intent"],
                    "domain_switch_detected": True,
                    "cleared_active_loop": cleared_active_loop,
                    "cleared_slots": cleared_slots,
                })
            logger.info({
                "intent": "action_default_fallback",
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]
        brand_lookup = build_brand_lookup(load_catalogue())
        if looks_like_product_query(raw_text, brand_lookup):
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        consecutive_fallbacks = 0
        for event in reversed(tracker.events):
            if event.get("event") == "user":
                continue
            if event.get("event") == "action":
                if event.get("name") == "action_default_fallback":
                    consecutive_fallbacks += 1
                elif event.get("name") not in {"action_listen", "action_set_language"}:
                    break

        lang = get_language(tracker)
        if consecutive_fallbacks >= 1:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Here are some options to help you move forward:",
                    "Berikut adalah beberapa pilihan untuk membantu anda:",
                    "这里有一些选项可以帮助您："
                ),
                buttons=[
                    {"title": tr(lang, "Browse Products", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                    {"title": tr(lang, "Pricing", "Harga", "查看价格"), "payload": "/ask_pricing"},
                    {"title": tr(lang, "Stores", "Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Support", "Sokongan", "售后支持"), "payload": "/after_sales_support"},
                ],
            )
            return []

        dispatcher.utter_message(
            text=tr(
                lang,
                "I am not sure what you mean. I can help with products, pricing, stores, appointments, or support.",
                "Saya tidak pasti maksud anda. Saya boleh bantu dengan produk, harga, kedai, janji temu, atau sokongan.",
                "我不确定您的意思。我可以协助产品、价格、门店、预约或售后支持。"
            ),
            buttons=[
                {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                {"title": tr(lang, "Check Pricing", "Semak Harga", "查看价格"), "payload": "/ask_pricing"},
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
            ],
        )
        return []



class ActionHandleGreet(Action):
    def name(self) -> Text:
        return "action_handle_greet"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        active_loop = get_active_loop_name(tracker)
        requested_slot = tracker.get_slot("requested_slot")
        
        if not active_loop:
            dispatcher.utter_message(response="utter_greet")
            return []
        
        # User said "hi" during a form - they want to exit/restart
        logger.info(f"User greeted during form ({active_loop}). Resetting state and showing greeting.")
        events, _, _ = reset_conversation_state(tracker)
        dispatcher.utter_message(response="utter_greet")
        return events


