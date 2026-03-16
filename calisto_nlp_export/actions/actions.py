import logging
import os
import re
from functools import lru_cache
from typing import Any, Dict, List, Text

import pandas as pd
from rasa_sdk import Action, Tracker
from rasa_sdk.events import SlotSet
from rasa_sdk.executor import CollectingDispatcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CATALOGUE_PATH = os.getenv(
    "KB_CATALOGUE_PATH",
    "knowledge_base/calisto_product_catalog_500.csv",
)


@lru_cache(maxsize=1)
def load_catalogue() -> pd.DataFrame:
    """Load the local product catalogue once per action-server process."""
    df = pd.read_csv(CATALOGUE_PATH).fillna("")
    if "price_myr" in df.columns:
        df["price_myr"] = pd.to_numeric(df["price_myr"], errors="coerce")
    return df


def filter_by_budget(df: pd.DataFrame, budget_slot: Text) -> pd.DataFrame:
    if not budget_slot:
        return df

    budget_lower = str(budget_slot).lower().replace(" ", "").replace("–", "-")
    if "underrm100" in budget_lower:
        return df[df["price_myr"] < 100]
    if "rm100-rm250" in budget_lower:
        return df[(df["price_myr"] >= 100) & (df["price_myr"] <= 250)]
    if "rm250-rm300" in budget_lower:
        return df[(df["price_myr"] >= 250) & (df["price_myr"] <= 300)]
    if "aboverm300" in budget_lower:
        return df[df["price_myr"] > 300]

    match_under = re.search(r"under\s*rm\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_under:
        return df[df["price_myr"] <= float(match_under.group(1))]

    match_over = re.search(r"(?:over|above)\s*rm\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_over:
        return df[df["price_myr"] >= float(match_over.group(1))]

    match_range = re.search(r"rm?\s*(\d+(?:\.\d+)?)\s*-\s*rm?\s*(\d+(?:\.\d+)?)", str(budget_slot).lower())
    if match_range:
        low = float(match_range.group(1))
        high = float(match_range.group(2))
        return df[(df["price_myr"] >= low) & (df["price_myr"] <= high)]

    return df


def format_product(row: pd.Series) -> str:
    brand = row.get("brand") or "Unknown Brand"
    name = row.get("product_name") or "Unknown Product"
    price = row.get("price_myr")
    city = row.get("city") or ""
    store = row.get("store_location") or ""
    suffix = f"\nLocation: {store}, {city}".rstrip(", ")
    return f"{brand} - {name}\nPrice: RM{price:.2f}{suffix}"


def unique_cities(df: pd.DataFrame) -> List[str]:
    cities = [str(city).strip() for city in df["city"].tolist() if str(city).strip()]
    return sorted(set(cities), key=str.lower)


def search_store_rows(df: pd.DataFrame, city: str) -> pd.DataFrame:
    return df[df["city"].astype(str).str.contains(city, case=False, na=False)][
        ["store_location", "city"]
    ].drop_duplicates()


class ActionResetEyewearSlots(Action):
    def name(self) -> Text:
        return "action_reset_eyewear_slots"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        return [
            SlotSet("product_type", None),
            SlotSet("brand", None),
            SlotSet("price_range", None),
            SlotSet("frame_shape", None),
            SlotSet("frame_color", None),
            SlotSet("frame_material", None),
            SlotSet("lens_type", None),
            SlotSet("city", None),
        ]


class ActionFilterProducts(Action):
    def name(self) -> Text:
        return "action_filter_products"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        product_type = tracker.get_slot("product_type")
        brand = tracker.get_slot("brand")
        price_range = tracker.get_slot("price_range")

        logger.info(
            "CSV Filtering - product_type='%s' brand='%s' price_range='%s'",
            product_type,
            brand,
            price_range,
        )

        try:
            filtered_df = load_catalogue().copy()
            if product_type and str(product_type).lower() != "contact lenses":
                filtered_df = filtered_df[
                    filtered_df["product_type"].astype(str).str.contains(product_type, case=False, na=False)
                ]
            if brand and str(brand).lower() != "show all brands":
                filtered_df = filtered_df[
                    filtered_df["brand"].astype(str).str.contains(brand, case=False, na=False)
                ]
            filtered_df = filter_by_budget(filtered_df, price_range)
            top_5 = filtered_df.head(5)
        except Exception as exc:
            logger.error("Catalogue query failed: %s", exc)
            dispatcher.utter_message(
                text="Our product catalogue is currently unavailable. Please check back later."
            )
            return []

        if top_5.empty:
            dispatcher.utter_message(
                text="We couldn't find any eyewear matching your precise criteria. Try exploring another brand or budget limit."
            )
            return []

        dispatcher.utter_message(text="Here are some products that match your request:")
        for _, row in top_5.iterrows():
            dispatcher.utter_message(text=format_product(row))
        return []


class ActionExplainLens(Action):
    def name(self) -> Text:
        return "action_explain_lens"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lens_type = tracker.get_slot("lens_type")
        explanations = {
            "Single Vision Lenses": (
                "Single vision lenses have the same prescription power across the entire lens. "
                "They are used to correct nearsightedness, farsightedness, or astigmatism."
            ),
            "Progressive Lenses": (
                "Progressive lenses provide a seamless transition between near, intermediate, "
                "and far vision, without visible lines. Perfect for presbyopia."
            ),
            "Blue Light Protection": (
                "Blue light lenses block harmful blue light emitted from digital screens, "
                "reducing eye strain and improving sleep."
            ),
            "Photochromic Lenses": (
                "Photochromic lenses automatically darken when exposed to sunlight and fade "
                "back to clear indoors."
            ),
        }
        if lens_type in explanations:
            dispatcher.utter_message(text=explanations[lens_type])
        else:
            logger.warning("Lens type '%s' not found in known explanations.", lens_type)
        return []


class ActionAskCity(Action):
    def name(self) -> Text:
        return "action_ask_city"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        try:
            cities = unique_cities(load_catalogue())
            buttons = [
                {"title": city.title(), "payload": f'/choose_city{{"city":"{city}"}}'}
                for city in cities[:10]
            ]
            dispatcher.utter_message(text="Which city are you looking for?", buttons=buttons or None)
        except Exception as exc:
            logger.error("Failed to fetch cities from knowledge base: %s", exc)
            dispatcher.utter_message(text="Which city are you looking for?")
        return []


class ActionFindStore(Action):
    def name(self) -> Text:
        return "action_find_store"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        city = tracker.get_slot("city")
        if not city:
            dispatcher.utter_message(text="Please specify the city to find a store.")
            return []

        try:
            stores = search_store_rows(load_catalogue(), str(city))
        except Exception as exc:
            logger.error("Store lookup failed: %s", exc)
            dispatcher.utter_message(text="Store information is temporarily unavailable.")
            return []

        if stores.empty:
            dispatcher.utter_message(text=f"I couldn't find any Calisto stores in {str(city).title()}.")
            return []

        dispatcher.utter_message(text=f"Here are the stores we found in {str(city).title()}:")
        for _, row in stores.head(10).iterrows():
            store = row.get("store_location") or "Calisto Store"
            store_city = row.get("city") or city
            dispatcher.utter_message(text=f"{store}\nCity: {store_city}")
        return []


class ActionSearchProductByAttribute(Action):
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        frame_color = tracker.get_slot("frame_color")
        frame_shape = tracker.get_slot("frame_shape")
        frame_material = tracker.get_slot("frame_material")
        user_message = (tracker.latest_message.get("text") or "").lower()

        logger.info(
            "CSV attribute search - color='%s' shape='%s' material='%s'",
            frame_color,
            frame_shape,
            frame_material,
        )

        try:
            filtered_df = load_catalogue().copy()
            if frame_color:
                filtered_df = filtered_df[
                    filtered_df["frame_color"].astype(str).str.contains(frame_color, case=False, na=False)
                ]
            if frame_shape:
                filtered_df = filtered_df[
                    filtered_df["frame_shape"].astype(str).str.contains(frame_shape, case=False, na=False)
                ]
            if frame_material:
                filtered_df = filtered_df[
                    filtered_df["frame_material"].astype(str).str.contains(frame_material, case=False, na=False)
                ]

            if not frame_color and not frame_shape and not frame_material and len(user_message) > 3:
                for part in user_message.split():
                    if len(part) <= 3 or part in {"need", "want", "looking", "glasses", "sunglasses", "frames"}:
                        continue
                    mask = (
                        filtered_df["frame_color"].astype(str).str.contains(part, case=False, na=False)
                        | filtered_df["frame_shape"].astype(str).str.contains(part, case=False, na=False)
                        | filtered_df["frame_material"].astype(str).str.contains(part, case=False, na=False)
                        | filtered_df["description"].astype(str).str.contains(part, case=False, na=False)
                        | filtered_df["product_name"].astype(str).str.contains(part, case=False, na=False)
                    )
                    if not filtered_df[mask].empty:
                        filtered_df = filtered_df[mask]

            top_5 = filtered_df.head(5)
        except Exception as exc:
            logger.error("Attribute query failed: %s", exc)
            dispatcher.utter_message(
                text="Our product catalogue is currently unavailable. Please try again later."
            )
            return []

        if top_5.empty:
            dispatcher.utter_message(text="I couldn't find any products perfectly matching your description.")
            return []

        dispatcher.utter_message(text="Here are some options based on what you asked for:")
        for _, row in top_5.iterrows():
            name = row.get("product_name") or "Unknown Frame"
            color = str(row.get("frame_color") or "").title()
            shape = str(row.get("frame_shape") or "").title()
            material = str(row.get("frame_material") or "").title()
            price = row.get("price_myr")
            details = " ".join(part for part in [color, shape, material] if part).strip()
            label = f"{name} ({details})" if details else name
            dispatcher.utter_message(text=f"{label} - RM {price:.2f}")
        return []


class ActionFilterLenses(Action):
    def name(self) -> Text:
        return "action_filter_lenses"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        lens_type = tracker.get_slot("lens_type")
        price_range = tracker.get_slot("price_range")

        logger.info("CSV Lens Filter - lens_type='%s' price_range='%s'", lens_type, price_range)

        try:
            df = load_catalogue().copy()
            mask = (
                df["category"].astype(str).str.contains("Lens", case=False, na=False)
                | df["product_type"].astype(str).str.contains("Lens", case=False, na=False)
                | df["category"].astype(str).str.contains("Contact", case=False, na=False)
            )
            if lens_type:
                needle = str(lens_type).lower().replace(" lenses", "").replace(" protection", "").strip()
                lens_mask = (
                    df["lens_type"].astype(str).str.contains(needle, case=False, na=False)
                    | df["lens_feature"].astype(str).str.contains(needle, case=False, na=False)
                    | df["product_name"].astype(str).str.contains(needle, case=False, na=False)
                    | df["description"].astype(str).str.contains(needle, case=False, na=False)
                )
                mask = mask & lens_mask
            results = filter_by_budget(df[mask], price_range).head(5)
        except Exception as exc:
            logger.error("Lens query failed: %s", exc)
            dispatcher.utter_message(text="Our product catalogue is temporarily unavailable.")
            return []

        if results.empty:
            dispatcher.utter_message(
                text="We couldn't find any lenses matching your criteria. Try adjusting the search."
            )
            return []

        dispatcher.utter_message(text="Here are some matching lenses:")
        for _, row in results.iterrows():
            dispatcher.utter_message(text=f"{row['product_name']} - RM {row['price_myr']:.2f}")
        return []


class ActionAskBrand(Action):
    def name(self) -> Text:
        return "action_ask_brand"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        product_type = tracker.get_slot("product_type")

        try:
            df = load_catalogue().copy()
            if product_type:
                df = df[df["product_type"].astype(str).str.contains(product_type, case=False, na=False)]
            brands = sorted(
                {
                    str(brand).strip()
                    for brand in df["brand"].tolist()
                    if str(brand).strip()
                },
                key=str.lower,
            )[:4]
        except Exception as exc:
            logger.error("Error fetching brands from knowledge base: %s", exc)
            brands = []

        buttons = [
            {"title": brand.title(), "payload": f'/select_brand{{"brand":"{brand}"}}'}
            for brand in brands
        ]
        buttons.append({"title": "Show All Brands", "payload": '/select_brand{"brand":"Show All Brands"}'})

        if product_type and "contact" in str(product_type).lower():
            text = "Which brand of contact lenses would you like to explore?"
        elif product_type and "sunglasses" in str(product_type).lower():
            text = "What brand of sunglasses are you interested in?"
        else:
            text = "Which brand would you like to explore?"

        dispatcher.utter_message(text=text, buttons=buttons)
        return []
