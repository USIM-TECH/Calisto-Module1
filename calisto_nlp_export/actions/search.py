import logging
from typing import Any, Dict, List, Text, Optional
import re
import json
import time
import pandas as pd
from functools import lru_cache
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
from search.filters import _lens_feature_match, _yes_no_match

logger = logging.getLogger(__name__)

_RECENT_SEARCH_SIGNATURES: Dict[str, float] = {}
_RECENT_SEARCH_WINDOW_SECONDS = 1.5


def _search_signature(tracker: Tracker, raw_text: str, intent_name: str) -> str:
    sender_id = str(getattr(tracker, "sender_id", "") or "").strip()
    normalized_text = normalize_search_text(raw_text)
    # Keep this keyed to the turn content, not flow state, so a single user
    # message cannot re-enter search if the interruption path flips flows.
    return "|".join([sender_id, intent_name, normalized_text])


def _is_recent_search(signature: str) -> bool:
    now = time.monotonic()
    expired = [key for key, ts in _RECENT_SEARCH_SIGNATURES.items() if now - ts > _RECENT_SEARCH_WINDOW_SECONDS]
    for key in expired:
        _RECENT_SEARCH_SIGNATURES.pop(key, None)

    last_seen = _RECENT_SEARCH_SIGNATURES.get(signature)
    if last_seen is None:
        _RECENT_SEARCH_SIGNATURES[signature] = now
        return False

    if now - last_seen <= _RECENT_SEARCH_WINDOW_SECONDS:
        return True

    _RECENT_SEARCH_SIGNATURES[signature] = now
    return False


def _tracker_recent_search_signature(tracker: Tracker) -> tuple[str, float]:
    signature = str(tracker.get_slot("last_product_search_signature") or "").strip()
    ts_raw = tracker.get_slot("last_product_search_ts")
    try:
        ts = float(ts_raw) if ts_raw not in (None, "") else 0.0
    except (TypeError, ValueError):
        ts = 0.0
    return signature, ts

class ActionSmartSearch(Action):
    def name(self) -> Text:
        return "action_smart_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        intent_name = intent.get("name") if intent else ""
        support_intent, override_reason, keyword_match = detect_support_intent(tracker)

        signature = _search_signature(tracker, raw_text, intent_name)
        tracker_signature, tracker_ts = _tracker_recent_search_signature(tracker)
        now = time.time()
        if not support_intent and (
            _is_recent_search(signature)
            or (tracker_signature == signature and now - tracker_ts <= _RECENT_SEARCH_WINDOW_SECONDS)
        ):
            logger.info(
                "Skipping duplicate product search for sender=%s flow=%s intent=%s query=%s",
                str(getattr(tracker, "sender_id", "") or "")[:8],
                str(tracker.get_slot("current_flow") or "").strip(),
                intent_name,
                raw_text,
            )
            return []
        
        if support_intent:
            switch = detect_domain_switch(tracker, intent_name, raw_text, support_intent)
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
                "intent": intent_name,
                "support_keyword_match": keyword_match,
                "override": support_intent,
                "override_reason": override_reason,
                "final_route": "support_flow",
                "context_state": {s: tracker.get_slot(s) for s in MANAGED_SLOTS}
            })
            support_events = route_support_flow(dispatcher, tracker, support_intent)
            return [*reset_events, *support_events]

        lang = get_language(tracker)
        events: List[Dict[Text, Any]] = []
        events.extend(apply_domain_switch_reset(tracker, intent_name, raw_text, support_intent))
        events.extend(flow_entry_events(tracker, "product_search"))

        search_events, success = search_products_engine(raw_text, tracker, lang, intent_name, dispatcher)
        events.extend(search_events)
        if search_events:
            events.append(SlotSet("last_product_search_signature", signature))
            events.append(SlotSet("last_product_search_ts", f"{now:.6f}"))
        if not success:
            events.append(FollowupAction("action_listen"))

        return events



class ActionDocumentSearch(Action):
    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_query = (tracker.latest_message.get("text") or "").strip()
        lang = get_language(tracker)
        if not raw_query:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "Could you please rephrase your question? I didn't catch that.",
                    "Boleh anda nyatakan semula soalan anda? Saya kurang pasti.",
                    "您能换个说法问吗？我没听懂。"
                )
            )
            return []

        try:
            faq_entries = list(load_kb_metadata())
        except RuntimeError as exc:
            logger.error("Knowledge base load failed: %s", exc)
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I can't reach the knowledge base right now. Please try again in a moment or contact support.",
                    "Pangkalan pengetahuan tidak dapat diakses buat masa ini. Sila cuba lagi atau hubungi sokongan.",
                    "暂时无法访问知识库，请稍后再试或联系客服。",
                ),
            )
            return []

        latest_intent = (tracker.latest_message.get("intent") or {}).get("name") or ""
        faq_boost = latest_intent == "ask_faq"
        query_lower = raw_query.lower()

        keyword_groups = {
            "refund": {"refund", "return", "exchange", "size", "fit"},
            "warranty": {"warranty", "cover", "broken", "damage", "policy"},
            "booking": {"book", "appointment", "eye test", "online"},
            "after_sales": {"adjustment", "after-sales", "after sales", "fitting", "support"},
            "stores": {"store", "location", "branch", "outlet"},
        }

        requested_group: Optional[str] = None
        for group_name, keywords in keyword_groups.items():
            if any(keyword in query_lower for keyword in keywords):
                requested_group = group_name
                break

        best_result = None
        best_score = 0
        if faq_entries:
            ranked = []
            for entry in faq_entries:
                text = str(entry.get("text") or "").strip()
                if not text:
                    continue

                source = str(entry.get("source") or "").lower()
                score = 0
                if faq_boost and "faq" in source:
                    score += 2
                if requested_group == "refund":
                    score += 5 if "refund or return policy" in text.lower() else 0
                    score += 2 if "refund" in text.lower() else 0
                    score += 2 if "exchange" in text.lower() else 0
                elif requested_group == "warranty":
                    score += 3 if "warranty" in text.lower() else 0
                elif requested_group == "booking":
                    score += 3 if "book an eye test online" in text.lower() else 0
                elif requested_group == "after_sales":
                    score += 3 if "after-sales support" in text.lower() else 0
                elif requested_group == "stores":
                    score += 3 if "stores located" in text.lower() else 0

                for token in re.findall(r"[a-z0-9]+", query_lower):
                    if len(token) > 2 and token in text.lower():
                        score += 1

                if score > 0:
                    ranked.append((score, entry))

            if ranked:
                ranked.sort(key=lambda item: item[0], reverse=True)
                best_score = ranked[0][0]
                best_result = ranked[0][1]

        if not best_result:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I'm sorry, I couldn't find that information in the Calisto knowledge base.\n\nYou can try rephrasing, or I can connect you to support.",
                    "Maaf, saya tidak temui maklumat tersebut.\n\nAnda boleh cuba lagi, atau saya boleh hubungkan anda dengan sokongan.",
                    "抱歉，我找不到该信息。\n\n您可以重新描述，或者我帮您联系客服。"
                )
            )
        else:
            answer = best_result.get("text", "").strip()
            answer = clean_faq_answer(answer, requested_group)

            words = answer.split()
            if len(words) > 150:
                answer = " ".join(words[:150]) + " ..."

            logger.info(
                "Matched knowledge-base source '%s' with score %.3f",
                best_result.get("source", "unknown"),
                float(best_score),
            )
            # Skip the 📄 text for warranty since utter_warranty_policy_menu already contains it in the card title
            if requested_group != "warranty":
                dispatcher.utter_message(text=f"📄 {answer}")

        # Provide contextual follow up instead of escalating automatically
        if requested_group == "warranty":
            dispatcher.utter_message(response="utter_warranty_policy_menu")
        elif requested_group == "refund":
            dispatcher.utter_message(response="utter_return_policy_menu")
        else:
            dispatcher.utter_message(response="utter_support_actions_menu")
            
        return []



class ActionGreetOrSearch(Action):
    def name(self) -> Text:
        return "action_greet_or_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_text = tracker.latest_message.get("text") or ""
        intent = get_latest_intent(tracker)
        intent_name = intent.get("name") if intent else ""

        # Check if the user typed a free-text message (not a payload)
        is_free_text_query = not raw_text.startswith("/")

        # If it's a free text query for products, show results directly
        if is_free_text_query and intent_name in {"search_product", "browse_eyewear", "select_product_type", "greet"}:
            product_type = tracker.get_slot("product_type") or detect_category_from_text(raw_text)

            # If they just said "hi", don't force a product search, let the regular greeting happen
            if not product_type and intent_name == "greet":
                pass
            # If they asked for a product (even without a specific intent matched), show it
            elif product_type or intent_name in {"search_product", "browse_eyewear", "select_product_type"}:
                slots_to_set = [
                    SlotSet("product_type", product_type or "Frames"),
                    SlotSet("brand", "all"),
                    SlotSet("price_range", None),
                    SlotSet("budget", None),
                    SlotSet("budget_min", None),
                    SlotSet("budget_max", None)
                ]

                logger.info("Free-text product query detected in ActionGreetOrSearch. Applying default filters.")
                return slots_to_set + [FollowupAction("action_filter_products")]

        brand_lookup = build_brand_lookup(load_catalogue())
        if looks_like_product_query(raw_text, brand_lookup):
            return ActionSmartSearch().run(dispatcher, tracker, domain)

        dispatcher.utter_message(response="utter_greet")
        return []


@lru_cache(maxsize=1)
def build_dynamic_attribute_registry() -> Dict[str, tuple[str, str]]:
    df = load_catalogue()
    registry: Dict[str, tuple[str, str]] = {}
    
    # IMPORTANT: frame_shape, frame_material, frame_color must come AFTER frame_style
    # so their registry entries overwrite frame_style collisions (e.g. 'square', 'round')
    target_columns = [
        "gender", "frame_style",
        "rim_type", "lens_type", "lens_feature", "lens_color", "lens_duration", "polarized", "multifocal", "category", "product_type",
        "brand", "use_case", "stock_status", "lightweight", "sports", 
        "office", "uv_protection", "blue_light",
        "frame_shape", "frame_material", "frame_color",
    ]
    
    for col in target_columns:
        if col in df.columns:
            unique_vals = df[col].dropna().unique()
            for val in unique_vals:
                val_str = str(val).strip()
                if not val_str or val_str.lower() in ("no", "false", "nan", "none"):
                    continue
                if val_str.lower() in ("yes", "true", "y"):
                    key = canonical_text_key(col.replace("_", " "))
                    if key:
                        registry[key] = (col, "Yes")
                else:
                    key = canonical_text_key(val_str)
                    if key:
                        registry[key] = (col, val_str)
                        if col in ("frame_shape", "frame_material", "frame_color", "gender", "category"):
                            tokens = key.split()
                            if len(tokens) > 1:
                                for token in tokens:
                                    if len(token) > 3 and token not in registry:
                                        registry[token] = (col, val_str)

    aliases = {
        # Gender
        "men": ("gender", "men"), "mens": ("gender", "men"), "male": ("gender", "men"), "boys": ("gender", "men"),
        "women": ("gender", "women"), "womens": ("gender", "women"), "female": ("gender", "women"), "girls": ("gender", "women"),
        "unisex": ("gender", "unisex"),
        # Category
        "glasses": ("category", "Frames"), "frames": ("category", "Frames"), "spectacles": ("category", "Frames"),
        "sunglasses": ("category", "Sunglasses"), "shades": ("category", "Sunglasses"),
        "contacts": ("category", "Contact Lenses"), "contact lenses": ("category", "Contact Lenses"),
        # Shape aliases (map to frame_shape — must use CSV-exact lowercase values)
        "round": ("frame_shape", "round"), "circular": ("frame_shape", "round"),
        "square": ("frame_shape", "square"), "square shaped": ("frame_shape", "square"),
        "rectangle": ("frame_shape", "rectangle"), "rectangular": ("frame_shape", "rectangle"),
        "aviator": ("frame_shape", "aviator"), "aviators": ("frame_shape", "aviator"),
        "cat eye": ("frame_shape", "cat-eye"), "cat-eye": ("frame_shape", "cat-eye"), "cateye": ("frame_shape", "cat-eye"),
        "oval": ("frame_shape", "oval"),
        # Material aliases (map to frame_material)
        "metal": ("frame_material", "metal"), "metallic": ("frame_material", "metal"),
        "titanium": ("frame_material", "titanium"),
        "acetate": ("frame_material", "acetate"), "plastic": ("frame_material", "acetate"),
        "rimless": ("frame_material", "rimless"),
        # Color aliases (map to frame_color)
        "black": ("frame_color", "black"),
        "brown": ("frame_color", "brown"),
        "silver": ("frame_color", "silver"),
        "gold": ("frame_color", "gold"), "golden": ("frame_color", "gold"),
        "tortoise": ("frame_color", "tortoise"), "tortoiseshell": ("frame_color", "tortoise"),
        # Use case / feature
        "blue light": ("lens_feature", "Blue Light Filter"), "bluelight": ("lens_feature", "Blue Light Filter"),
        "anti blue light": ("lens_feature", "Blue Light Filter"),
        "screen protection": ("lens_feature", "Blue Light Filter"),
        "computer work": ("lens_feature", "Blue Light Filter"),
        "gaming glasses": ("lens_feature", "Blue Light Filter"),
        "office glasses": ("lens_feature", "Blue Light Filter"),
        "progressive": ("lens_type", "Progressive"), "progressive lenses": ("lens_type", "Progressive"), "progressive glasses": ("lens_type", "Progressive"),
        "bifocal": ("lens_type", "Bifocal"), "bifocal lenses": ("lens_type", "Bifocal"), "bifocal glasses": ("lens_type", "Bifocal"),
        "multifocal": ("multifocal", "yes"), "multifocal lenses": ("multifocal", "yes"), "multifocal glasses": ("multifocal", "yes"),
        "polarized": ("polarized", "yes"), "polarised": ("polarized", "yes"), "glare reduction": ("polarized", "yes"),
        "uv protection": ("uv_protection", "yes"), "uv blocking": ("uv_protection", "yes"), "sun protection": ("uv_protection", "yes"),
        "photochromic": ("lens_feature", "Photochromic"), "transition lenses": ("lens_feature", "Photochromic"),
        "office": ("use_case", "Office"), "gaming": ("use_case", "Gaming"), "sports": ("use_case", "Sports"),
        "driving": ("use_case", "Driving"), "daily wear": ("use_case", "Daily"), "daily": ("use_case", "Daily"),
    }
    for k, v in aliases.items():
        registry[k] = v
        
    return registry

def extract_dynamic_attributes(text: str, registry: Dict[str, tuple[str, str]]) -> Dict[str, set]:
    extracted = {}
    normalized = canonical_text_key(text)
    words = normalized.split()
    
    ngrams = []
    for n in range(3, 0, -1):
        for i in range(len(words) - n + 1):
            ngrams.append(" ".join(words[i:i+n]))
            
    matched_tokens = set()
    for ngram in ngrams:
        tokens = ngram.split()
        if any(tok in matched_tokens for tok in tokens):
            continue
        if ngram in registry:
            col, val = registry[ngram]
            if col not in extracted:
                extracted[col] = set()
            extracted[col].add(val)
            for tok in tokens:
                matched_tokens.add(tok)
                
    return extracted

def is_refinement_query(query: str) -> bool:
    if not query:
        return False
    refinement_words = {"only", "instead", "same", "similar", "also", "show more", "narrower", "cheaper", "expensive", "another", "these", "those"}
    query_lower = query.lower()
    for word in refinement_words:
        if re.search(rf"\b{re.escape(word)}\b", query_lower):
            return True
    return False

# ── Strict gender matching ────────────────────────────────────────────
_GENDER_SYNONYMS: Dict[str, set] = {
    "men":    {"men", "male", "mens", "man", "boys"},
    "women":  {"women", "female", "womens", "woman", "girls"},
    "unisex": {"unisex"},
}

def _gender_match_set(requested: str) -> set:
    """Return the set of CSV gender values that satisfy *requested*."""
    key = requested.strip().lower()
    for canonical, synonyms in _GENDER_SYNONYMS.items():
        if key in synonyms:
            return {canonical}          # exact CSV value
    return {key}                        # unknown → pass-through

def _build_strict_gender_mask(df: pd.DataFrame, requested_genders: set) -> pd.Series:
    """Return a boolean mask that is True only for rows whose gender
    exactly matches one of the requested genders (no substring tricks)."""
    allowed: set = set()
    for rg in requested_genders:
        allowed.update(_gender_match_set(rg))
    col_lower = df["gender"].astype(str).str.strip().str.lower()
    return col_lower.isin(allowed)


def search_products_engine(
    raw_text: str, 
    tracker: Tracker, 
    lang: str, 
    intent_name: str,
    dispatcher: CollectingDispatcher
) -> tuple[List[Dict[str, Any]], bool]:
    events: List[Dict[Text, Any]] = []
    normalized = normalize_search_text(raw_text)
    df = load_catalogue().copy()
    registry = build_dynamic_attribute_registry()

    def payload_flag(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "y"}

    def budget_label(minimum: Optional[float], maximum: Optional[float]) -> str:
        if minimum is not None and maximum is not None:
            return f"between RM{minimum:g} and RM{maximum:g}"
        if minimum is not None:
            return f"above RM{minimum:g}"
        if maximum is not None:
            return f"under RM{maximum:g}"
        return ""

    def is_show_all_brand(value: Any) -> bool:
        return str(value or "").strip().lower() in {"show all brands", "all brands", "any", "any brand"}

    def row_matches(row: pd.Series, column: str, values: set) -> bool:
        if column in {"uv_protection", "polarized", "multifocal"}:
            if column == "uv_protection":
                for value in values:
                    if _yes_no_match(pd.Series([row.get(column, "")]), str(value)).iloc[0]:
                        return True
                    if str(value).lower() in {"true", "1", "y", "yes"}:
                        lens_feat = str(row.get("lens_feature", "")).lower()
                        if "uv block" in lens_feat:
                            return True
                return False
            return any(_yes_no_match(pd.Series([row.get(column, "")]), str(value)).iloc[0] for value in values)
        if column == "lens_feature":
            return any(_lens_feature_match(pd.Series([row.get(column, "")]), str(value)).iloc[0] for value in values)
        if column == "gender":
            allowed: set = set()
            for requested in values:
                allowed.update(_gender_match_set(requested))
            return str(row.get("gender", "")).strip().lower() in allowed
        if column == "brand":
            allowed_brands = {str(value).strip().lower() for value in values}
            return str(row.get("brand", "")).strip().lower() in allowed_brands
        if column == "product_type":
            allowed_product_types = {str(value).strip().lower() for value in values}
            return str(row.get("product_type", "")).strip().lower() in allowed_product_types
        candidate = str(row.get(column, ""))
        return any(re.search(re.escape(value), candidate, re.IGNORECASE) for value in values)

    def apply_filters(source: pd.DataFrame, filters: Dict[str, set]) -> pd.DataFrame:
        filtered_df = source.copy()
        ordered = [
            col
            for col in [
                "uv_protection", "polarized", "multifocal", "lens_type", "lens_feature", "lens_color", "lens_duration",
                "product_type", "brand", "gender", "frame_shape", "frame_material", "frame_color", "use_case",
            ]
            if col in filters
        ]
        remaining = [col for col in filters if col not in ordered]
        for col in [*ordered, *remaining]:
            if col not in filtered_df.columns:
                continue
            values = filters[col]
            if col in {"uv_protection", "polarized", "multifocal"}:
                if col == "uv_protection":
                    masks = []
                    for value in values:
                        mask = _yes_no_match(filtered_df[col], str(value))
                        if str(value).lower() in {"true", "1", "y", "yes"}:
                            if "lens_feature" in filtered_df.columns:
                                mask = mask | filtered_df["lens_feature"].astype(str).str.contains("uv block", case=False, na=False)
                        masks.append(mask)
                    if masks:
                        filtered_df = filtered_df[pd.concat(masks, axis=1).any(axis=1)]
                else:
                    masks = [_yes_no_match(filtered_df[col], str(value)) for value in values]
                    if masks:
                        filtered_df = filtered_df[pd.concat(masks, axis=1).any(axis=1)]
            elif col == "lens_feature":
                masks = [_lens_feature_match(filtered_df[col], str(value)) for value in values]
                if masks:
                    filtered_df = filtered_df[pd.concat(masks, axis=1).any(axis=1)]
            elif col == "gender":
                filtered_df = filtered_df[_build_strict_gender_mask(filtered_df, values)]
            elif col == "brand":
                allowed_brands = {str(value).strip().lower() for value in values}
                filtered_df = filtered_df[filtered_df["brand"].astype(str).str.strip().str.lower().isin(allowed_brands)]
            elif col == "product_type":
                allowed_product_types = {str(value).strip().lower() for value in values}
                filtered_df = filtered_df[filtered_df["product_type"].astype(str).str.strip().str.lower().isin(allowed_product_types)]
            else:
                masks = [filtered_df[col].astype(str).str.contains(re.escape(value), case=False, na=False) for value in values]
                if masks:
                    filtered_df = filtered_df[pd.concat(masks, axis=1).any(axis=1)]
        return filtered_df

    payload: Dict[str, Any] = {}
    current_filters: Dict[str, set] = {}
    current_b_min = None
    current_b_max = None
    current_price_range: Optional[str] = None
    allow_similar_requested = False
    current_budget_provided = False
    clear_brand_filter = False

    if raw_text.startswith("/"):
        try:
            start = raw_text.find("{")
            if start != -1:
                payload = json.loads(raw_text[start:])
                allow_similar_requested = payload_flag(payload.get("allow_similar"))
                if "budget_min" in payload:
                    current_b_min = payload["budget_min"]
                    current_budget_provided = True
                if "budget_max" in payload:
                    current_b_max = payload["budget_max"]
                    current_budget_provided = True
                if "budget_bucket" in payload:
                    current_budget_provided = True
                if "price_range" in payload:
                    current_price_range = str(payload["price_range"])
                    current_budget_provided = True
                    parsed_payload_budget = parse_budget_from_text(current_price_range)
                    if parsed_payload_budget:
                        if parsed_payload_budget.get("budget_min") is not None:
                            current_b_min = parsed_payload_budget["budget_min"]
                        if parsed_payload_budget.get("budget_max") is not None:
                            current_b_max = parsed_payload_budget["budget_max"]
                for k, v in payload.items():
                    if k not in ["allow_similar", "budget_min", "budget_max", "budget_bucket", "price_range"]:
                        if k == "brand" and is_show_all_brand(v):
                            clear_brand_filter = True
                            continue
                        current_filters[k] = {str(v)}
        except Exception:
            payload = {}

    extracted_text = extract_dynamic_attributes(normalized, registry)
    extracted_lens = extract_lens_requirements(normalized)
    for k, v in extracted_lens.items():
        if k not in extracted_text:
            extracted_text[k] = set()
        extracted_text[k].update(v)
    for k, v in extracted_text.items():
        if k not in current_filters:
            current_filters[k] = set()
        current_filters[k].update(v)

    parsed_budget = None if raw_text.startswith("/") else parse_budget_from_text(normalized)
    if parsed_budget:
        current_budget_provided = True
        if parsed_budget.get("budget_min") is not None:
            current_b_min = parsed_budget["budget_min"]
        if parsed_budget.get("budget_max") is not None:
            current_b_max = parsed_budget["budget_max"]

    previous_filters: Dict[str, str] = {}
    for slot in ["gender", "product_type", "brand", "frame_shape", "frame_material", "frame_color", "category", "use_case", "uv_protection", "polarized", "lens_color", "lens_type", "lens_feature", "lens_duration", "multifocal"]:
        val = tracker.get_slot(slot)
        if slot == "brand" and is_show_all_brand(val):
            clear_brand_filter = True
            continue
        if val:
            previous_filters[slot] = str(val)
    prev_b_min = tracker.get_slot("budget_min")
    prev_b_max = tracker.get_slot("budget_max")

    is_refinement = intent_name in {"select_budget", "select_brand"} or is_refinement_query(normalized) or allow_similar_requested

    extracted: Dict[str, set] = {}
    b_min, b_max = current_b_min, current_b_max

    if is_refinement:
        for k, v in previous_filters.items():
            extracted[k] = {v}
        if not current_budget_provided:
            if b_min is None and prev_b_min is not None:
                b_min = prev_b_min
            if b_max is None and prev_b_max is not None:
                b_max = prev_b_max
        for k, v in current_filters.items():
            if k not in extracted:
                extracted[k] = set()
            extracted[k].update(v)
    else:
        extracted = current_filters
        for slot in MANAGED_SLOTS:
            events.append(SlotSet(slot, None))

    try:
        b_min = float(b_min) if b_min is not None else None
    except (ValueError, TypeError):
        b_min = None
    try:
        b_max = float(b_max) if b_max is not None else None
    except (ValueError, TypeError):
        b_max = None

    if "product_type" not in extracted and "category" in extracted:
        product_types_from_category = set()
        for category in extracted["category"]:
            category_key = str(category).strip().lower()
            mapped_product_type = {
                "frames": "Designer Frames",
                "sunglasses": "Luxury Sunglasses",
                "contact lenses": "Contact Lenses",
            }.get(category_key)
            if mapped_product_type:
                product_types_from_category.add(mapped_product_type)
        if product_types_from_category:
            extracted["product_type"] = product_types_from_category
    extracted.pop("category", None)

    filtered = df.copy()
    filtered["price_myr"] = pd.to_numeric(filtered["price_myr"], errors="coerce")
    priority_filters = {
        key: value
        for key, value in extracted.items()
        if key in LENS_FILTER_COLUMNS or key in {"product_type", "brand"}
    }
    style_filters = {
        key: value
        for key, value in extracted.items()
        if key not in LENS_FILTER_COLUMNS and key not in {"product_type", "brand", "category"}
    }
    filtered = apply_filters(filtered, priority_filters)
    if b_min is not None:
        filtered = filtered[filtered["price_myr"] > b_min]
    if b_max is not None:
        filtered = filtered[filtered["price_myr"] <= b_max]
    filtered = apply_filters(filtered, style_filters)

    debug_logs = {
        "query": raw_text,
        "is_refinement": is_refinement,
        "allow_similar_requested": allow_similar_requested,
        "previous_filters": previous_filters,
        "current_filters": {k: list(v) for k, v in current_filters.items()},
        "final_filters": {k: list(v) for k, v in extracted.items()},
        "strict_results": len(filtered),
    }
    if b_min is not None:
        debug_logs["final_filters"]["budget_min"] = b_min
    if b_max is not None:
        debug_logs["final_filters"]["budget_max"] = b_max

    relaxed_flags: List[str] = []
    fallback_mode = False
    has_lens_filters = any(key in LENS_FILTER_COLUMNS for key in extracted)

    if filtered.empty and allow_similar_requested:
        fallback_mode = True
        relaxed_filtered = df.copy()
        relaxed_filtered["price_myr"] = pd.to_numeric(relaxed_filtered["price_myr"], errors="coerce")
        locked_filters = {
            key: value
            for key, value in extracted.items()
            if key in LENS_FILTER_COLUMNS or key in {"product_type", "gender"}
        }
        optional_filters = {
            key: set(value)
            for key, value in extracted.items()
            if key not in LENS_FILTER_COLUMNS and key not in {"product_type", "gender", "category"}
        }
        relaxed_filtered = apply_filters(relaxed_filtered, locked_filters)
        if b_min is not None:
            relaxed_filtered = relaxed_filtered[relaxed_filtered["price_myr"] > b_min]
        if b_max is not None:
            relaxed_filtered = relaxed_filtered[relaxed_filtered["price_myr"] <= b_max]
        relax_order = ["brand", "frame_shape", "frame_material", "frame_color", "use_case"]

        for step in range(len(relax_order) + 1):
            temp_filtered = apply_filters(relaxed_filtered, optional_filters)
            if not temp_filtered.empty:
                filtered = temp_filtered
                break
            if step < len(relax_order):
                col_to_relax = relax_order[step]
                if col_to_relax in optional_filters:
                    del optional_filters[col_to_relax]
                    relaxed_flags.append(col_to_relax)

        debug_logs["relaxed_filters"] = relaxed_flags
        debug_logs["fallback_results"] = len(filtered)

    logger.info(json.dumps(debug_logs))

    brand_value = list(extracted["brand"])[0] if "brand" in extracted and extracted["brand"] else ""
    product_type_value = list(extracted["product_type"])[0] if "product_type" in extracted and extracted["product_type"] else ""
    use_case_value = list(extracted["use_case"])[0] if "use_case" in extracted and extracted["use_case"] else ""

    if filtered.empty and not allow_similar_requested:
        for col, values in extracted.items():
            if col in MANAGED_SLOTS and values:
                events.append(SlotSet(col, list(values)[0]))
        if clear_brand_filter:
            events.append(SlotSet("brand", None))
        if b_min is not None:
            events.append(SlotSet("budget_min", b_min))
        elif current_budget_provided:
            events.append(SlotSet("budget_min", None))
        if b_max is not None:
            events.append(SlotSet("budget_max", b_max))
        elif current_budget_provided:
            events.append(SlotSet("budget_max", None))
        if current_price_range is not None:
            events.append(SlotSet("price_range", current_price_range))
        elif current_budget_provided:
            events.append(SlotSet("price_range", None))

        if has_lens_filters:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I couldn't find products matching all selected requirements. Would you like to see the closest alternatives?",
                    "Saya tidak menemui produk yang sepadan dengan semua keperluan yang dipilih. Adakah anda mahu lihat alternatif paling hampir?",
                    "我找不到符合所有已选要求的产品。您想看看最接近的替代选择吗？",
                ),
                buttons=[
                    {"title": tr(lang, "Show Alternatives", "Lihat Alternatif", "查看替代选择"), "payload": '/search_product{"allow_similar":true}'},
                    {"title": tr(lang, "Change Filters", "Ubah Penapis", "更改筛选"), "payload": "/browse_eyewear"},
                ],
            )
            return events, False

        product_type_label = product_type_value or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        brand_label = brand_value or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        budget_text = budget_label(b_min, b_max)
        budget_label_text = budget_text or tr(lang, "Not specified", "Tidak dinyatakan", "未指定")
        msg = tr(
            lang,
            (
                "We currently do not have matching products for:\n"
                f"- Product Type: {product_type_label}\n"
                f"- Brand: {brand_label}\n"
                f"- Budget: {budget_label_text}\n\n"
                "Would you like to:\n"
                "- View similar brands\n"
                "- Change budget\n"
                "- Explore other product categories"
            ),
            (
                "Kami belum mempunyai produk yang sepadan untuk:\n"
                f"- Jenis Produk: {product_type_label}\n"
                f"- Jenama: {brand_label}\n"
                f"- Bajet: {budget_label_text}\n\n"
                "Adakah anda mahu:\n"
                "- Lihat jenama serupa\n"
                "- Ubah bajet\n"
                "- Teroka kategori produk lain"
            ),
            (
                "目前没有符合以下条件的产品：\n"
                f"- 产品类型：{product_type_label}\n"
                f"- 品牌：{brand_label}\n"
                f"- 预算：{budget_label_text}\n\n"
                "您想要：\n"
                "- 查看相近品牌\n"
                "- 更改预算\n"
                "- 探索其他产品类别"
            ),
        )
        dispatcher.utter_message(
            text=msg,
            buttons=[
                {"title": tr(lang, "View Similar Brands", "Lihat Jenama Serupa", "查看相近品牌"), "payload": '/search_product{"allow_similar":true}'},
                {"title": tr(lang, "Change Filters", "Ubah Penapis", "更改筛选"), "payload": "/browse_eyewear"},
            ],
        )
        return events, False

    if filtered.empty:
        dispatcher.utter_message(
            text=tr(
                lang,
                "I still could not find suitable alternatives in that product type and budget. If you want, I can help you adjust the brand or price range next.",
                "Saya masih tidak menemui alternatif yang sesuai dalam jenis produk dan bajet tersebut. Jika anda mahu, saya boleh bantu laraskan jenama atau julat harga seterusnya.",
                "在该类别和预算内，我仍然找不到合适的相近款式。如果您愿意，我可以继续帮您调整品牌或价格范围。",
            )
        )
        return events, False

    ranking_type = product_type_value or None
    ranking_brand = None if "brand" in relaxed_flags else (brand_value or None)
    ranked = rank_products_safely(filtered, product_type=ranking_type, brand=ranking_brand, use_case=use_case_value or None)
    top_results = ranked.head(5)

    if not extracted and b_min is None and b_max is None:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Here are some popular picks right now:",
                "Berikut pilihan popular ketika ini:",
                "这是目前的热门推荐："
            )
        )
    elif fallback_mode:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Closest matching products in the same product type and budget:",
                "Pilihan paling hampir dalam jenis produk dan bajet yang sama:",
                "以下是同类别、同预算下最接近的可选款式："
            )
        )
    else:
        dispatcher.utter_message(
            text=tr(
                lang,
                "Recommended options matching your selected filters:",
                "Pilihan disyorkan yang sepadan dengan penapis pilihan anda:",
                "以下是符合您已选筛选条件的推荐款式："
            )
        )

    required_validation = {key: set(value) for key, value in extracted.items()}
    if fallback_mode:
        for relaxed in relaxed_flags:
            required_validation.pop(relaxed, None)

    emitted_count = 0
    seen_cards: set[str] = set()
    for _, row in top_results.iterrows():
        p_price = pd.to_numeric(row.get("price_myr"), errors="coerce")
        if pd.isna(p_price):
            p_price = 0
        if b_max is not None and p_price > b_max:
            continue
        if b_min is not None and p_price <= b_min:
            continue
        if any(not row_matches(row, col, values) for col, values in required_validation.items() if col in row.index):
            continue
        # Add channel information to the product dict for platform-aware image selection
        product_dict = row.to_dict()
        card_key = "|".join([
            str(product_dict.get("product_id") or "").strip().lower(),
            str(product_dict.get("brand") or "").strip().lower(),
            str(product_dict.get("product_name") or "").strip().lower(),
            str(product_dict.get("store_location") or "").strip().lower(),
            str(product_dict.get("city") or "").strip().lower(),
        ])
        if card_key in seen_cards:
            continue
        seen_cards.add(card_key)
        metadata = latest_metadata(tracker)
        product_dict["_channel"] = str(metadata.get("channel") or "").lower()
        emit_product_card(dispatcher, product_dict, str(ranking_type) if ranking_type else "", lang)
        emitted_count += 1

    if emitted_count == 0:
        if clear_brand_filter:
            events.append(SlotSet("brand", None))
        if b_min is not None:
            events.append(SlotSet("budget_min", b_min))
        elif current_budget_provided:
            events.append(SlotSet("budget_min", None))
        if b_max is not None:
            events.append(SlotSet("budget_max", b_max))
        elif current_budget_provided:
            events.append(SlotSet("budget_max", None))
        if current_price_range is not None:
            events.append(SlotSet("price_range", current_price_range))
        elif current_budget_provided:
            events.append(SlotSet("price_range", None))
        if has_lens_filters and not allow_similar_requested:
            dispatcher.utter_message(
                text=tr(
                    lang,
                    "I couldn't find products matching all selected requirements. Would you like to see the closest alternatives?",
                    "Saya tidak menemui produk yang sepadan dengan semua keperluan yang dipilih. Adakah anda mahu lihat alternatif paling hampir?",
                    "我找不到符合所有已选要求的产品。您想看看最接近的替代选择吗？",
                ),
                buttons=[
                    {"title": tr(lang, "Show Alternatives", "Lihat Alternatif", "查看替代选择"), "payload": '/search_product{"allow_similar":true}'},
                    {"title": tr(lang, "Change Filters", "Ubah Penapis", "更改筛选"), "payload": "/browse_eyewear"},
                ],
            )
            return events, False
        dispatcher.utter_message(
            text=tr(
                lang,
                "I couldn't find products that safely meet those filters.",
                "Saya tidak menemui produk yang benar-benar memenuhi penapis tersebut.",
                "我没有找到能稳妥满足这些筛选条件的产品。",
            )
        )
        return events, False

    for col, values in extracted.items():
        if col in MANAGED_SLOTS:
            events.append(SlotSet(col, list(values)[0]))
    if clear_brand_filter:
        events.append(SlotSet("brand", None))
    if b_min is not None:
        events.append(SlotSet("budget_min", b_min))
    elif current_budget_provided:
        events.append(SlotSet("budget_min", None))
    if b_max is not None:
        events.append(SlotSet("budget_max", b_max))
    elif current_budget_provided:
        events.append(SlotSet("budget_max", None))
    if current_price_range is not None:
        events.append(SlotSet("price_range", current_price_range))
    elif current_budget_provided:
        events.append(SlotSet("price_range", None))

    return events, True
