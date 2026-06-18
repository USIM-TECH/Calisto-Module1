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

logger = logging.getLogger(__name__)

class ActionAskCity(Action):
    def name(self) -> Text:
        return "action_ask_city"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        # Check latest entities first (message-level), then slots
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or tracker.get_slot("city")
            or tracker.get_slot("lead_location")
        )
        # Also scan the raw message for city names if no entity/slot
        if not city_candidate:
            msg = tracker.latest_message.get("text") or ""
            city_candidate = resolve_city(msg) or None
        resolved_city = resolve_city(city_candidate)
        if resolved_city:
            city = resolved_city
            stores = search_store_rows(load_catalogue(), city)
            if stores.empty:
                dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
                events.append(SlotSet("city", city))
                return events

            for _, row in stores.head(6).iterrows():
                emit_store_card(
                    dispatcher,
                    str(row.get("store_location", "Calisto Store")),
                    str(row.get("city", city)),
                    lang,
                )
            events.append(SlotSet("city", city))
            return events

        if tracker.get_slot("city") is not None:
            events.append(SlotSet("city", None))

        cities = unique_cities(load_catalogue())
        buttons = [
            {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
            for city in cities[:10]
        ]
        dispatcher.utter_message(text=tr(lang, "Which city are you looking for?", "Bandar mana yang anda cari?", "您想查哪个城市？"), buttons=buttons or None)
        return events



class ActionFindStore(Action):
    def name(self) -> Text:
        return "action_find_store"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        city_candidate = tracker.get_slot("city") or tracker.get_slot("lead_location")
        city = resolve_city(city_candidate)
        if not city:
            dispatcher.utter_message(text=tr(lang, "Please specify the city to find a store.", "Sila nyatakan bandar untuk mencari kedai.", "请提供要查询的城市。"))
            if tracker.get_slot("city") is not None:
                events.append(SlotSet("city", None))
            return events

        stores = search_store_rows(load_catalogue(), str(city))
        if stores.empty:
            dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
            return events

        for _, row in stores.head(6).iterrows():
            emit_store_card(
                dispatcher,
                str(row.get('store_location', 'Calisto Store')),
                str(row.get('city', city)),
                lang,
            )
        return events



class ActionHandleStoreHours(Action):
    def name(self) -> Text:
        return "action_handle_store_hours"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "store_lookup"))
        lang = get_language(tracker)
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or tracker.get_slot("city")
            or tracker.get_slot("lead_location")
        )
        if not city_candidate:
            msg = tracker.latest_message.get("text") or ""
            city_candidate = resolve_city(msg) or None
        city = resolve_city(city_candidate)
        if city:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    f"Most Calisto stores in {titleize(str(city))} typically follow mall operating hours, usually around {DEFAULT_STORE_HOURS}. I recommend confirming before visiting.",
                    f"Kebanyakan kedai Calisto di {titleize(str(city))} biasanya mengikut waktu operasi pusat beli-belah, sekitar {DEFAULT_STORE_HOURS}. Saya syorkan anda sahkan dahulu sebelum datang.",
                    f"{titleize(str(city))} 的大多数 Calisto 门店通常跟随商场营业时间，一般为 {DEFAULT_STORE_HOURS}。建议您到店前先确认。"
                ),
                buttons=[
                    {"title": tr(lang, "Show Stores", "Lihat Kedai", "查看门店"), "payload": f'/choose_city{{"city":"{city}"}}'},
                    {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
                ],
            )
            return events

        dispatcher.utter_message(
            text=tr(lang, f"Most Calisto stores typically follow mall operating hours, usually around {DEFAULT_STORE_HOURS}. If you tell me the city or mall, I can point you to the right location.", f"Kebanyakan kedai Calisto biasanya mengikut waktu operasi pusat beli-belah, sekitar {DEFAULT_STORE_HOURS}. Jika anda beritahu bandar atau pusat beli-belah, saya boleh tunjuk lokasi yang sesuai.", f"大多数 Calisto 门店通常跟随商场营业时间，一般为 {DEFAULT_STORE_HOURS}。如果您告诉我城市或商场，我可以为您找到对应门店。"),
            buttons=[
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": "/book_appointment"},
            ],
        )
        return events



class ActionBookAppointment(Action):
    def name(self) -> Text:
        return "action_book_appointment"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        
        # Try to fetch booking instructions
        try:
            faq_entries = load_kb_metadata()
            best_result = None
            for entry in faq_entries:
                text = str(entry.get("text") or "").strip().lower()
                if "book an eye test online" in text or "booking" in text:
                    best_result = entry
                    break
                    
            if best_result:
                answer = best_result.get("text", "").strip()
                if " A:" in answer:
                    answer = answer.split(" A:", 1)[1].strip()
                if " Q:" in answer:
                    answer = answer.split(" Q:", 1)[0].strip()
                dispatcher.utter_message(text=f"📄 {answer}")
            else:
                dispatcher.utter_message(
                    text=tr(
                        lang,
                        "You can easily book an appointment through our website or by visiting a store.",
                        "Anda boleh menempah janji temu melalui laman web kami atau di kedai fizikal.",
                        "您可以通过我们的网站或前往门店轻松预约。"
                    )
                )
        except Exception as e:
            logger.error(f"Failed to fetch booking policy: {e}")
            dispatcher.utter_message(text="You can book an appointment directly on our website.")
            
        # Instead of triggering a lead form, give them options
        dispatcher.utter_message(
            text=tr(
                lang,
                "What would you like to do next?",
                "Apakah langkah seterusnya yang anda mahu ambil?",
                "您想接下来怎么继续？"
            ),
            buttons=[
                {"title": "Find Nearest Store", "payload": "/find_a_store"},
                {"title": "Ask a Question", "payload": "/ask_a_question"},
                {"title": "Support & Policies", "payload": "/support_and_policies"}
            ]
        )
        return []

