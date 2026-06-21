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
from actions.search import ActionSmartSearch, search_products_engine

logger = logging.getLogger(__name__)

class ActionFilterProducts(Action):
    def name(self) -> Text:
        return "action_filter_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        return ActionSmartSearch().run(dispatcher, tracker, domain)



class ActionExplainLens(Action):
    def name(self) -> Text:
        return "action_explain_lens"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        if extract_lens_requirements(raw_text) and not is_explicit_lens_education_query(raw_text) and not raw_text.startswith("/ask_lens_type"):
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "lens_consultation"))
        lang = get_language(tracker)
        lens_type = tracker.get_slot("lens_type")
        lens_feature = tracker.get_slot("lens_feature")
        explanations = {
            "Single Vision": "Single vision lenses have one prescription power across the lens and are ideal for distance or near correction.",
            "Single Vision Lenses": "Single vision lenses have one prescription power across the lens and are ideal for distance or near correction.",
            "Progressive": "Progressive lenses combine near, intermediate, and distance vision without visible lines.",
            "Progressive Lenses": "Progressive lenses combine near, intermediate, and distance vision without visible lines.",
            "Bifocal": "Bifocal lenses provide two prescription zones for near and distance vision.",
            "Bifocal Lenses": "Bifocal lenses provide two prescription zones for near and distance vision.",
            "Blue Light": "Blue light lenses help reduce digital eye strain and filter high-energy visible light from screens.",
            "Blue Light Protection": "Blue light lenses help reduce digital eye strain and filter high-energy visible light from screens.",
            "Blue Light Filter": "Blue light lenses help reduce digital eye strain and filter high-energy visible light from screens.",
            "Photochromic": "Photochromic lenses darken outdoors and turn clear indoors for all-day convenience.",
            "Photochromic Lenses": "Photochromic lenses darken outdoors and turn clear indoors for all-day convenience.",
            "Polarized": "Polarized lenses help reduce glare from reflective surfaces and bright outdoor light.",
            "UV Protection": "UV protection helps shield your eyes from sunlight exposure.",
            "Multifocal": "Multifocal lenses combine multiple vision zones to support both near and distance viewing.",
        }
        if lens_type in explanations:
            dispatcher.utter_message(text=explanations[lens_type])
        elif lens_feature in explanations:
            dispatcher.utter_message(text=explanations[lens_feature])
        else:
            dispatcher.utter_message(text=tr(lang, "I can explain different lens solutions if you tell me which one you are considering.", "Saya boleh terangkan pilihan kanta yang berbeza jika anda beritahu yang mana anda sedang pertimbangkan.", "如果您告诉我您正在考虑哪一种，我可以为您解释不同的镜片方案。"))
        dispatcher.utter_message(
            text=tr(lang, "If you want, I can help you compare more lens options, find a store, or arrange a consultation.", "Jika anda mahu, saya boleh bantu bandingkan lebih banyak pilihan kanta, cari kedai, atau aturkan konsultasi.", "如果您愿意，我可以帮您比较更多镜片方案、查找门店，或安排咨询。"),
            buttons=[
                {"title": tr(lang, "Set Budget", "Tetapkan Bajet", "设置预算"), "payload": '/select_budget{"price_range":"RM100 - RM250"}'},
                {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
            ],
        )
        return events



class ActionRecommendProducts(Action):
    def name(self) -> Text:
        return "action_recommend_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)
        if support_intent:
            switch = detect_domain_switch(tracker, intent["name"], raw_text, support_intent)
            reset_events: List[Dict[Text, Any]] = []
            if switch["detected"]:
                reset_events, cleared_slots, cleared_active_loop = reset_conversation_state(tracker)
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]
        
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, support_intent))
        events.extend(flow_entry_events(tracker, "product_recommendation"))
        lang = get_language(tracker)
        
        search_events, success = search_products_engine(raw_text, tracker, lang, intent["name"], dispatcher)
        events.extend(search_events)
        
        return events



class ActionSearchProductByAttribute(Action):
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        return ActionSmartSearch().run(dispatcher, tracker, domain)



class ActionFilterLenses(Action):
    def name(self) -> Text:
        return "action_filter_lenses"

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
        events.extend(flow_entry_events(tracker, "lens_consultation"))
        lang = get_language(tracker)
        lens_type = tracker.get_slot("lens_type")
        price_range = tracker.get_slot("price_range")

        df = load_catalogue().copy()
        
        solution_mask = (
            df["product_type"].astype(str).str.contains("solution", case=False, na=False) |
            df["category"].astype(str).str.contains("solution", case=False, na=False) |
            df["product_name"].astype(str).str.contains("solution", case=False, na=False)
        )
        df = df[~solution_mask]

        mask = (
            df["category"].astype(str).str.contains("Lens", case=False, na=False)
            | df["product_type"].astype(str).str.contains("Lens", case=False, na=False)
            | df["category"].astype(str).str.contains("Contact", case=False, na=False)
        )
        if lens_type:
            needle = str(lens_type).lower().replace(" lenses", "").replace(" protection", "").strip()
            if "single vision" in needle:
                mask = mask & df["lens_type"].astype(str).str.contains("single vision", case=False, na=False)
                mask = mask & ~df["lens_type"].astype(str).str.contains("progressive|multifocal|bifocal", case=False, na=False)
                if "multifocal" in df.columns:
                    mask = mask & ~df["multifocal"].astype(str).str.contains("yes|true|y|1", case=False, na=False)
            elif "progressive" in needle or "multifocal" in needle or "bifocal" in needle:
                mask = mask & df["lens_type"].astype(str).str.contains(needle, case=False, na=False)
                mask = mask & ~df["lens_type"].astype(str).str.contains("single vision", case=False, na=False)
            else:
                mask = mask & (
                    df["lens_type"].astype(str).str.contains(needle, case=False, na=False)
                    | df["lens_feature"].astype(str).str.contains(needle, case=False, na=False)
                    | df["product_name"].astype(str).str.contains(needle, case=False, na=False)
                    | df["description"].astype(str).str.contains(needle, case=False, na=False)
                )
        results = filter_by_budget(df[mask], price_range).head(5)

        if results.empty:
            dispatcher.utter_message(text=tr(lang, "We could not find any lenses matching your criteria.", "Kami tidak menemui kanta yang sepadan dengan kriteria anda.", "我们找不到符合您条件的镜片。"))
            return events

        metadata = latest_metadata(tracker)
        channel = str(metadata.get("channel") or "").lower()

        for _, row in results.iterrows():
            product_dict = row.to_dict()
            product_dict["_channel"] = channel
            emit_product_card(dispatcher, product_dict, str(lens_type or "Lens Consultation"), lang)
        return events



class ActionAskBrand(Action):
    def name(self) -> Text:
        return "action_ask_brand"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        is_free_text_query = not raw_text.startswith("/")
        print(f"DEBUG ActionAskBrand: raw_text='{raw_text}', is_free_text_query={is_free_text_query}")
        if is_free_text_query:
            print("DEBUG ActionAskBrand: Returning ActionSmartSearch() directly")
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        events = flow_entry_events(tracker, "browse_eyewear")
        lang = get_language(tracker)
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
            text = tr(lang, "Which brand of contact lenses would you like to explore?", "Jenama kanta sentuh mana yang anda mahu lihat?", "您想看哪个品牌的隐形眼镜？")
        elif product_type and "sunglasses" in str(product_type).lower():
            text = tr(lang, "What brand of sunglasses are you interested in?", "Jenama cermin mata hitam mana yang anda minati?", "您对哪个太阳镜品牌感兴趣？")
        else:
            text = tr(lang, "Which brand would you like to explore?", "Jenama mana yang anda mahu lihat?", "您想看哪个品牌？")

        dispatcher.utter_message(text=text, buttons=buttons)
        return events



class ActionAskBudgetRange(Action):
    def name(self) -> Text:
        return "action_ask_budget_range"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        is_free_text_query = not raw_text.startswith("/")
        
        # If user typed a free text query (not button click), filter immediately
        if is_free_text_query:
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        # For button clicks, just ask for budget and wait for user selection
        dispatcher.utter_message(response="utter_ask_budget_range")
        return []



class ActionAskPurchaseTimeline(Action):
    def name(self) -> Text:
        return "action_ask_purchase_timeline"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lang = get_language(tracker)
        text = tr(
            lang,
            "How soon are you planning to make a decision or visit a store?",
            "Anda merancang untuk membuat keputusan atau melawat kedai dalam tempoh bila?",
            "您打算多久内做决定或到门店看看？",
        )
        buttons = [
            {
                "title": tr(lang, "This Week", "Minggu Ini", "本周"),
                "payload": '/share_timeline{"purchase_timeline":"This Week"}',
            },
            {
                "title": tr(lang, "Within 2 Weeks", "Dalam 2 Minggu", "两周内"),
                "payload": '/share_timeline{"purchase_timeline":"Within 2 Weeks"}',
            },
            {
                "title": tr(lang, "Just Exploring", "Sekadar Melihat", "先看看"),
                "payload": '/share_timeline{"purchase_timeline":"Just Exploring"}',
            },
        ]
        dispatcher.utter_message(text=text, buttons=buttons)
        return []



class ActionResetEyewearSlots(Action):
    def name(self) -> Text:
        return "action_reset_eyewear_slots"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        is_free_text_query = not raw_text.startswith("/")
        print(f"DEBUG ActionResetEyewearSlots: raw_text='{raw_text}', is_free_text_query={is_free_text_query}")
        if is_free_text_query:
            print("DEBUG ActionResetEyewearSlots: Returning ActionSmartSearch() directly")
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        intent = get_latest_intent(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent["name"], raw_text, ""))
        events.extend(flow_entry_events(tracker, "browse_eyewear"))
        events.extend([
            SlotSet("product_type", None),
            SlotSet("brand", None),
            SlotSet("price_range", None),
            SlotSet("frame_shape", None),
            SlotSet("frame_color", None),
            SlotSet("frame_material", None),
            SlotSet("lens_type", None),
            SlotSet("city", None),
        ])
        return events



class ActionShowPricing(Action):
    def name(self) -> Text:
        return "action_show_pricing"

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
        events.extend(flow_entry_events(tracker, "pricing"))
        lang = get_language(tracker)
        entities = canonicalize_entities(latest_entity_values(tracker))
        preferred_service = str(
            entities.get("preferred_service")
            or tracker.get_slot("preferred_service")
            or "Designer Frames"
        ).strip()
        preferred_service = canonicalize_slot_value("preferred_service", preferred_service)

        pricing_map: Dict[str, Dict[str, Any]] = {
            "Designer Frames": {
                "headline": tr(lang, "Designer Frame Pricing", "Harga Bingkai Pereka", "设计师镜框价格"),
                "lines": [
                    tr(lang, "Entry styles: RM180-RM320", "Gaya asas: RM180-RM320", "入门款：RM180-RM320"),
                    tr(lang, "Premium acetate and metal frames: RM320-RM680", "Bingkai asetat dan logam premium: RM320-RM680", "高级板材与金属镜框：RM320-RM680"),
                    tr(lang, "Luxury designer labels: RM680-RM1,280+", "Jenama pereka mewah: RM680-RM1,280+", "奢华设计师品牌：RM680-RM1,280+"),
                ],
                "note": tr(lang, "Final pricing depends on brand, material, and lens package.", "Harga akhir bergantung pada jenama, bahan, dan pakej kanta.", "最终价格取决于品牌、材质和镜片搭配。"),
                "buttons": [
                    {"title": tr(lang, "Browse Frames", "Lihat Bingkai", "浏览镜框"), "payload": '/select_product_type{"product_type":"Designer Frames"}'},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Designer Frames"}'},
                ],
            },
            "Luxury Sunglasses": {
                "headline": tr(lang, "Sunglass Pricing", "Harga Cermin Mata Hitam", "太阳镜价格"),
                "lines": [
                    tr(lang, "Everyday sunglasses: RM220-RM380", "Cermin mata hitam harian: RM220-RM380", "日常太阳镜：RM220-RM380"),
                    tr(lang, "Polarized and premium styles: RM380-RM720", "Gaya polarized dan premium: RM380-RM720", "偏光与高级款：RM380-RM720"),
                    tr(lang, "Luxury collections: RM720-RM1,450+", "Koleksi mewah: RM720-RM1,450+", "奢华系列：RM720-RM1,450+"),
                ],
                "note": tr(lang, "Pricing varies by lens tint, frame material, and brand collection.", "Harga berbeza ikut tint kanta, bahan bingkai, dan koleksi jenama.", "价格会因镜片颜色、镜框材质和品牌系列而不同。"),
                "buttons": [
                    {"title": tr(lang, "Browse Sunglasses", "Lihat Cermin Mata Hitam", "浏览太阳镜"), "payload": '/select_product_type{"product_type":"Luxury Sunglasses"}'},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Luxury Sunglasses"}'},
                ],
            },
            "Lens Consultation": {
                "headline": tr(lang, "Lens Pricing", "Harga Kanta", "镜片价格"),
                "lines": [
                    tr(lang, "Single vision lens upgrades: RM120-RM260", "Naik taraf kanta single vision: RM120-RM260", "单光镜片升级：RM120-RM260"),
                    tr(lang, "Blue light and digital comfort options: RM260-RM520", "Pilihan blue light dan keselesaan digital: RM260-RM520", "防蓝光与数码舒适方案：RM260-RM520"),
                    tr(lang, "Progressive and premium lens packages: RM520-RM1,180+", "Pakej kanta progresif dan premium: RM520-RM1,180+", "渐进与高级镜片方案：RM520-RM1,180+"),
                ],
                "note": tr(lang, "Lens pricing depends on prescription complexity, coating, and package selection.", "Harga kanta bergantung pada kerumitan preskripsi, salutan, dan pilihan pakej.", "镜片价格取决于处方复杂度、镀膜和套餐选择。"),
                "buttons": [
                    {"title": tr(lang, "Lens Options", "Pilihan Kanta", "镜片方案"), "payload": "/lens_vision_solutions"},
                    {"title": tr(lang, "Find Store", "Cari Kedai", "查找门店"), "payload": "/find_a_store"},
                    {"title": tr(lang, "Ask a Question", "Tanya Soalan", "提问"), "payload": '/capture_lead{"preferred_service":"Lens Consultation"}'},
                ],
            },
        }

        pricing_info = pricing_map.get(preferred_service, pricing_map["Designer Frames"])
        text = "\n\n".join([pricing_info["headline"], *pricing_info["lines"], pricing_info["note"]])
        dispatcher.utter_message(text=text, buttons=pricing_info["buttons"])
        return events

