import json
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


def _extract_city_from_payload(raw_text: str) -> Optional[str]:
    """Extract city from intent payload text like /choose_city{"city":"Batu Gajah"}.
    Rasa does not populate tracker.latest_message["entities"] for /intent{...} payloads.
    """
    import json
    if not raw_text or not raw_text.startswith("/"):
        return None
    brace = raw_text.find("{")
    if brace == -1:
        return None
    try:
        data = json.loads(raw_text[brace:])
        return str(data.get("city") or "").strip() or None
    except Exception:
        return None


def _store_value(store: Any, *keys: str) -> str:
    for key in keys:
        if isinstance(store, dict):
            value = store.get(key)
        else:
            value = store.get(key) if hasattr(store, "get") else None
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _emit_store_cards(dispatcher: CollectingDispatcher, stores: List[Any], city: str, lang: str, channel: str) -> None:
    for store in stores[:5]:
        emit_store_card(
            dispatcher,
            _store_value(store, "name", "store_location") or "Calisto Store",
            _store_value(store, "city") or city,
            lang,
            address=_store_value(store, "address"),
            phone=_store_value(store, "phone"),
            image_url=_store_value(store, "imageUrl", "image_url"),
            map_url=_store_value(store, "mapUrl", "map_url"),
            channel=channel,
        )

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
        metadata = latest_metadata(tracker)
        channel = str(metadata.get("channel") or "").lower()
        # Check latest entities first (message-level), then payload, then slots
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or _extract_city_from_payload(raw_text)
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
            store_records = search_store_records(city, limit=5)
            if not store_records:
                stores = search_store_rows(load_catalogue(), city)
                store_records = [row.to_dict() for _, row in stores.head(5).iterrows()]
            if not store_records:
                dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
                events.append(SlotSet("city", city))
                return events

            _emit_store_cards(dispatcher, store_records, city, lang, channel)
            events.append(SlotSet("city", city))
            return events

        if tracker.get_slot("city") is not None:
            events.append(SlotSet("city", None))

        cities = list_store_cities() or unique_cities(load_catalogue())
        buttons = [
            {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
            for city in cities
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
        metadata = latest_metadata(tracker)
        channel = str(metadata.get("channel") or "").lower()
        entities = latest_entity_values(tracker)
        city_candidate = (
            entities.get("city")
            or _extract_city_from_payload(raw_text)
            or tracker.get_slot("city")
            or tracker.get_slot("lead_location")
        )
        if not city_candidate:
            msg = tracker.latest_message.get("text") or ""
            city_candidate = resolve_city(msg) or None
        city = resolve_city(city_candidate)
        if not city:
            dispatcher.utter_message(text=tr(lang, "Please specify the city to find a store.", "Sila nyatakan bandar untuk mencari kedai.", "请提供要查询的城市。"))
            if tracker.get_slot("city") is not None:
                events.append(SlotSet("city", None))
            return events

        store_records = search_store_records(str(city), limit=5)
        if not store_records:
            stores = search_store_rows(load_catalogue(), str(city))
            store_records = [row.to_dict() for _, row in stores.head(5).iterrows()]
        if not store_records:
            dispatcher.utter_message(text=tr(lang, f"I could not find any Calisto stores in {titleize(city)}.", f"Saya tidak menemui mana-mana kedai Calisto di {titleize(city)}.", f"我暂时找不到 {titleize(city)} 的 Calisto 门店。"))
            return events

        _emit_store_cards(dispatcher, store_records, str(city), lang, channel)
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
                    {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": '/book_appointment{"service":"Store Visit"}'},
                ],
            )
            return events

        dispatcher.utter_message(
            text=tr(lang, f"Most Calisto stores typically follow mall operating hours, usually around {DEFAULT_STORE_HOURS}. If you tell me the city or mall, I can point you to the right location.", f"Kebanyakan kedai Calisto biasanya mengikut waktu operasi pusat beli-belah, sekitar {DEFAULT_STORE_HOURS}. Jika anda beritahu bandar atau pusat beli-belah, saya boleh tunjuk lokasi yang sesuai.", f"大多数 Calisto 门店通常跟随商场营业时间，一般为 {DEFAULT_STORE_HOURS}。如果您告诉我城市或商场，我可以为您找到对应门店。"),
            buttons=[
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Book Visit", "Tempah Lawatan", "预约到店"), "payload": '/book_appointment{"service":"Store Visit"}'},
            ],
        )
        return events



class ActionBookAppointment(Action):
    def name(self) -> Text:
        return "action_book_appointment"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        booking_url = BOOKING_URL or "https://client.calisto.co/home"
        events: List[Dict[Text, Any]] = []

        # ── Read context from the button payload ──────────────────────────────
        # Buttons can pass: /book_appointment{"service":"Eye Examination","brand":"RayBan","product_type":"Luxury Sunglasses"}
        raw_text = tracker.latest_message.get("text") or ""
        payload_data: Dict[str, Any] = {}
        if raw_text.startswith("/book_appointment{"):
            try:
                payload_data = json.loads(raw_text[len("/book_appointment"):])
            except Exception:
                payload_data = {}

        service = (
            str(payload_data.get("service") or "").strip()
            or str(tracker.get_slot("preferred_service") or "").strip()
            or "Eye Examination"
        )
        brand = str(payload_data.get("brand") or tracker.get_slot("brand") or "").strip()
        product_type = str(payload_data.get("product_type") or tracker.get_slot("product_type") or "").strip()

        # Build an enriched preferred_service string for the lead
        interest_parts = [p for p in [brand, product_type] if p]
        enriched_service = f"{service} — {', '.join(interest_parts)}" if interest_parts else service
        events.append(SlotSet("preferred_service", enriched_service))

        # ── Card title changes by service context ─────────────────────────────
        is_store_visit = "store visit" in service.lower() or "visit" in service.lower()
        card_title = tr(
            lang,
            "Book a Store Visit" if is_store_visit else "Book Eye Examination",
            "Tempah Lawatan ke Kedai" if is_store_visit else "Tempah Pemeriksaan Mata",
            "预约到店" if is_store_visit else "预约眼部检查",
        )
        card_subtitle_base = (
            tr(
                lang,
                "Visit one of our stores at a time that suits you.",
                "Lawati mana-mana kedai kami pada masa yang sesuai.",
                "在方便的时间前往我们的门店。",
            )
            if is_store_visit
            else tr(
                lang,
                "Use our online booking portal to schedule your appointment at a convenient time.",
                "Gunakan portal tempahan dalam talian kami untuk menjadualkan temujanji anda pada masa yang sesuai.",
                "使用我们的在线预约门户，在方便的时间安排您的预约。",
            )
        )
        # Append brand/product context to subtitle when available
        if interest_parts:
            interest_label = tr(
                lang,
                f"Interested in: {', '.join(interest_parts)}",
                f"Berminat: {', '.join(interest_parts)}",
                f"目标产品：{', '.join(interest_parts)}",
            )
            card_subtitle = f"{card_subtitle_base}\n{interest_label}"
        else:
            card_subtitle = card_subtitle_base

        # ── Intro text ────────────────────────────────────────────────────────
        dispatcher.utter_message(
            text=tr(
                lang,
                "You can conveniently book an eye examination online through our booking portal."
                if not is_store_visit
                else "You can find your nearest Calisto store and plan your visit below.",
                "Anda boleh menempah pemeriksaan mata secara dalam talian melalui portal tempahan kami."
                if not is_store_visit
                else "Anda boleh cari kedai Calisto terdekat dan rancang lawatan anda di bawah.",
                "您可以通过我们的在线预约门户预约眼部检查。"
                if not is_store_visit
                else "您可以查找最近的 Calisto 门店并在下方规划您的到店时间。",
            )
        )

        # ── Booking card ──────────────────────────────────────────────────────
        dispatcher.utter_message(
            json_message={
                "type": "card",
                "title": card_title,
                "subtitle": card_subtitle,
                "actions": [
                    {
                        "type": "url",
                        "title": tr(lang, "Open Booking Portal", "Buka Portal Tempahan", "打开预约门户"),
                        "value": booking_url,
                    },
                    {
                        "type": "postback",
                        "title": tr(lang, "Find Nearest Store", "Cari Kedai Terdekat", "查找最近门店"),
                        "value": "/find_a_store",
                    },
                    {
                        "type": "postback",
                        "title": tr(lang, "Back to Support", "Kembali ke Sokongan", "返回支持"),
                        "value": "/support_and_policies",
                    },
                ],
            }
        )
        return events


class ActionHandleAvailability(Action):
    """Handles product availability questions by entering the product search pipeline.

    Instead of returning a static message, this action prompts the user to
    specify what they are looking for and offers category quick-picks that feed
    directly into the existing ``ActionSmartSearch`` / ``search_products_engine``
    pipeline — returning real stock and real products from the catalogue.
    """

    def name(self) -> Text:
        return "action_handle_availability"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)

        dispatcher.utter_message(
            text=tr(
                lang,
                "What product are you looking for? I can check availability across our collections.",
                "Produk apa yang anda cari? Saya boleh semak ketersediaan merentas koleksi kami.",
                "您在找什么产品？我可以在我们的全系列中查询库存。",
            ),
            buttons=[
                {
                    "title": tr(lang, "Sunglasses", "Cermin Mata Hitam", "太阳镜"),
                    "payload": '/browse_eyewear{"product_type":"Luxury Sunglasses"}',
                },
                {
                    "title": tr(lang, "Frames", "Bingkai", "镜框"),
                    "payload": '/browse_eyewear{"product_type":"Designer Frames"}',
                },
                {
                    "title": tr(lang, "Contact Lenses", "Kanta Sentuh", "隐形眼镜"),
                    "payload": '/browse_eyewear{"product_type":"Contact Lenses"}',
                },
                {
                    "title": tr(lang, "Progressive Lenses", "Kanta Progresif", "渐进片"),
                    "payload": '/search_product{"lens_type":"Progressive"}',
                },
            ],
        )
        return []
