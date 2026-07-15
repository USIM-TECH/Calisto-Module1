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
        language = get_language(tracker)
        events = [SlotSet("preferred_language", language)]
        if current and current != language and current in {"en", "ms", "zh"}:
            dispatcher.utter_message(text=tr(
                language,
                "Got it, switching to English.",
                "Baik, saya akan berbahasa Melayu sekarang.",
                "好的，我现在切换到中文。",
            ))
        return events



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

    def _send_greet(self, dispatcher: CollectingDispatcher, lang: str) -> None:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Welcome to Calisto Eyewear.\nI can help you discover products, check pricing, find a store, or arrange a consultation. What would you like to do first?",
                "Selamat datang ke Calisto Eyewear.\nSaya boleh bantu anda melihat produk, semak harga, cari kedai, atau aturkan konsultasi. Apa yang anda mahu lakukan dahulu?",
                "欢迎来到 Calisto Eyewear。\n我可以帮您浏览产品、查看价格、寻找门店，或安排咨询。您想先做什么？",
            ),
            buttons=[
                {"title": tr(lang, "Browse Eyewear", "Lihat Produk", "浏览产品"), "payload": "/browse_eyewear"},
                {"title": tr(lang, "Check Pricing", "Semak Harga", "查看价格"), "payload": "/ask_pricing"},
                {"title": tr(lang, "Support & Policies", "Sokongan & Polisi", "支持与政策"), "payload": "/support_and_policies"},
            ],
        )
        emit_app_promo_card(dispatcher, lang)

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        active_loop = get_active_loop_name(tracker)
        lang = get_language(tracker)  # respects mid-conversation language switch

        if not active_loop:
            self._send_greet(dispatcher, lang)
            return []

        # User said "hi" during a form - they want to exit/restart
        logger.info(f"User greeted during form ({active_loop}). Resetting state and showing greeting.")
        events, _, _ = reset_conversation_state(tracker)
        self._send_greet(dispatcher, lang)
        return events



class ActionHandleGoodbye(Action):
    def name(self) -> Text:
        return "action_handle_goodbye"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        import random
        lang = get_language(tracker)

        _en = random.choice([
            "Thank you for visiting Calisto Eyewear. We hope to see you soon!",
            "Thanks for chatting with us! Feel free to come back anytime.",
            "It was great helping you today. Take care!",
            "Thank you! Don't hesitate to reach out if you need anything else.",
            "Goodbye! We look forward to helping you again soon.",
        ])
        _ms = random.choice([
            "Terima kasih kerana melawat Calisto Eyewear. Jumpa lagi!",
            "Terima kasih kerana berbual dengan kami! Jangan segan untuk kembali bila-bila masa.",
            "Seronok dapat membantu anda hari ini. Jaga diri!",
            "Terima kasih! Jangan teragak-agak untuk menghubungi kami jika ada apa-apa lagi.",
            "Selamat tinggal! Kami berharap dapat membantu anda lagi tidak lama lagi.",
        ])
        _zh = random.choice([
            "感谢您光临 Calisto Eyewear，期待再次为您服务！",
            "感谢您的咨询！随时欢迎您回来。",
            "很高兴今天能帮到您，保重！",
            "谢谢！如有任何需要，随时联系我们。",
            "再见！期待很快再次为您服务。",
        ])

        dispatcher.utter_message(text=tr(lang, _en, _ms, _zh))
        emit_app_promo_card(dispatcher, lang)
        return []
