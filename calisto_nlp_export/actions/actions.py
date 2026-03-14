import pandas as pd
import logging
import os
from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Paths for the product catalogue
PRODUCTION_CATALOGUE_PATH = "calisto_nlp_export/knowledge_base/calisto_product_catalog_500.csv"
FALLBACK_CATALOGUE_PATH = "knowledge_base/calisto_product_catalog_500.csv"

def load_catalogue() -> pd.DataFrame:
    """Helper function to load the catalog CSV into a DataFrame."""
    path = PRODUCTION_CATALOGUE_PATH if os.path.exists(PRODUCTION_CATALOGUE_PATH) else FALLBACK_CATALOGUE_PATH
    
    if not os.path.exists(path):
        logger.error(f"Catalogue file not found at both paths: {PRODUCTION_CATALOGUE_PATH} and {FALLBACK_CATALOGUE_PATH}")
        return pd.DataFrame()
        
    try:
        df = pd.read_csv(path)
        logger.info(f"Successfully loaded catalogue with {len(df)} products.")
        return df
    except Exception as e:
        logger.error(f"Failed to load catalogue: {e}")
        return pd.DataFrame()

# Load catalogue once at server start to optimize performance
CATALOGUE_DF = load_catalogue()


def filter_by_budget(df: pd.DataFrame, budget_slot: Text) -> pd.DataFrame:
    """Helper function to filter DataFrame by budget range."""
    if not budget_slot:
        return df
        
    try:
        budget_lower = budget_slot.lower().replace(" ", "").replace("–", "-")
        if "underrm100" in budget_lower:
            return df[df['price_myr'] < 100]
        elif "rm100-rm250" in budget_lower:
            return df[(df['price_myr'] >= 100) & (df['price_myr'] <= 250)]
        elif "rm250-rm300" in budget_lower:
            return df[(df['price_myr'] >= 250) & (df['price_myr'] <= 300)]
        elif "aboverm300" in budget_lower:
            return df[df['price_myr'] > 300]
    except Exception as e:
        logger.warning(f"Error filtering by budget '{budget_slot}': {e}")
        
    return df


class ActionResetEyewearSlots(Action):
    """Action to automatically reset the relevant slots when users restart Browse Eyewear flow."""
    def name(self) -> Text:
        return "action_reset_eyewear_slots"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        logger.info("Executing action_reset_eyewear_slots")
        return [
            SlotSet("product_type", None),
            SlotSet("brand", None),
            SlotSet("price_range", None)
        ]


class ActionFilterProducts(Action):
    """Filters products from the pre-loaded DataFrame based on user preferences."""
    def name(self) -> Text:
        return "action_filter_products"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        logger.info("Executing action_filter_products")
        
        product_type = tracker.get_slot("product_type")
        brand = tracker.get_slot("brand")
        price_range = tracker.get_slot("price_range")
        
        logger.info(f"Filtering with slots - product_type: '{product_type}', brand: '{brand}', price_range: '{price_range}'")
        
        if CATALOGUE_DF.empty:
            logger.error("Product catalogue DataFrame is empty. Sending error message to user.")
            dispatcher.utter_message(text="Our product catalogue is currently unavailable. Please check back later.")
            return []
            
        filtered_df = CATALOGUE_DF.copy()
        
        if product_type and product_type.lower() != "contact lenses":
            filtered_df = filtered_df[filtered_df['product_type'].str.contains(product_type, case=False, na=False)]
            
        if brand and brand.lower() != "show all brands":
            filtered_df = filtered_df[filtered_df['brand'].str.contains(brand, case=False, na=False)]
            
        if price_range:
            filtered_df = filter_by_budget(filtered_df, price_range)
            
        top_5 = filtered_df.head(5)
        
        if top_5.empty:
            logger.info("No products found matching criteria.")
            dispatcher.utter_message(text="We couldn't find any eyewear matching your precise criteria. Try exploring another brand or budget limit.")
        else:
            logger.info(f"Found and returning {len(top_5)} products.")
            dispatcher.utter_message(text="Here are some products that match your request:")
            for _, row in top_5.iterrows():
                brand_val = row.get("brand", "Unknown Brand")
                name_val = row.get("product_name", "Unknown Frame")
                price_val = row.get("price_myr", "N/A")
                
                dispatcher.utter_message(text=f"{brand_val} — {name_val}\nPrice: RM{price_val}")
                    
        return []


class ActionExplainLens(Action):
    """Provides a brief explanation of the lens type provided."""
    def name(self) -> Text:
        return "action_explain_lens"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        lens_type = tracker.get_slot("lens_type")
        logger.info(f"Executing action_explain_lens for lens_type: {lens_type}")
        
        explanations = {
            "Single Vision Lenses": "Single vision lenses have the same prescription power across the entire lens. They are used to correct nearsightedness, farsightedness, or astigmatism.",
            "Progressive Lenses": "Progressive lenses provide a seamless transition between near, intermediate, and far vision, without visible lines. Perfect for presbyopia.",
            "Blue Light Protection": "Blue light lenses block harmful blue light emitted from digital screens, reducing eye strain and improving sleep.",
            "Photochromic Lenses": "Photochromic lenses automatically darken when exposed to sunlight and fade back to clear indoors."
        }
        
        if lens_type in explanations:
            dispatcher.utter_message(text=explanations[lens_type])
        else:
            logger.warning(f"Lens type '{lens_type}' not found in known explanations.")
            
        return []


class ActionFindStore(Action):
    """Finds store details based on a given city or mall name."""
    def name(self) -> Text:
        return "action_find_store"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        city = tracker.get_slot("city")
        logger.info(f"Executing action_find_store for city: {city}")
        
        stores = {
            "Aeon Mall Nilai": "No 2, Persiaran Pusat Bandar, Putra Point, Putra Nilai, 71800 Nilai, Negeri Sembilan",
            "Lalaport Bukit Bintang": "No. 2, Jalan Hang Tuah, Bukit Bintang, 55100 Kuala Lumpur",
            "Melawati Mall": "355, Jalan Bandar Melawati, Pusat Bandar Melawati, 53100 Kuala Lumpur",
            "Mitsui Outlet Park": "Persiaran Komersial, KLIA, 64000 Sepang, Selangor"
        }
        
        if city and city in stores:
            address = stores[city]
            dispatcher.utter_message(text=f"**Store:** {city}\n**Address:** {address}\n\n[Get Directions](#) | [Contact Store](#)")
        else:
            logger.warning(f"Store for city '{city}' not found.")
            dispatcher.utter_message(text="Please select one of our available stores from the list.")
            
        return []



class ActionSearchProductByAttribute(Action):
    """Filters products by frame_color and frame_shape or free text user query."""
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        logger.info("Executing action_search_product_by_attribute")

        frame_color = tracker.get_slot("frame_color")
        frame_shape = tracker.get_slot("frame_shape")
        frame_material = tracker.get_slot("frame_material")
        user_message = (tracker.latest_message.get('text') or "").lower()

        if CATALOGUE_DF.empty:
            dispatcher.utter_message(text="Our product catalogue is currently unavailable.")
            return []

        filtered_df = CATALOGUE_DF.copy()

        if frame_color:
            filtered_df = filtered_df[filtered_df['frame_color'].astype(str).str.contains(frame_color, case=False, na=False)]
        
        if frame_shape:
            filtered_df = filtered_df[filtered_df['frame_shape'].astype(str).str.contains(frame_shape, case=False, na=False)]
            
        if frame_material:
            filtered_df = filtered_df[filtered_df['frame_material'].astype(str).str.contains(frame_material, case=False, na=False)]

        # fallback text fuzzy search if none of the slots triggered yet
        if not frame_color and not frame_shape and not frame_material and len(user_message) > 3:
            query_parts = user_message.split()
            for part in query_parts:
                if len(part) > 3 and part not in ["glasses", "sunglasses", "frames", "need", "want", "looking"]:
                    mask = (
                        filtered_df['frame_color'].astype(str).str.contains(part, case=False, na=False) |
                        filtered_df['frame_shape'].astype(str).str.contains(part, case=False, na=False) |
                        filtered_df['description'].astype(str).str.contains(part, case=False, na=False)
                    )
                    if not filtered_df[mask].empty:
                        filtered_df = filtered_df[mask]

        top_5 = filtered_df.head(5)

        if top_5.empty:
            logger.info("No query matches found in the catalog.")
            dispatcher.utter_message(text="I couldn't find any products perfectly matching your description.")
        else:
            dispatcher.utter_message(text="Here are some options based on what you asked for:\n")
            for _, row in top_5.iterrows():
                name_val = row.get("product_name", "Unknown Frame")
                color_val = row.get("frame_color", "") or ""
                shape_val = row.get("frame_shape", "") or ""
                price_val = row.get("price_myr", "N/A")
                desc = f"{str(color_val).title()} {str(shape_val).title()} Frame".strip()
                dispatcher.utter_message(text=f"‘ **{name_val}** ({desc}) - RM {price_val}")
                
        return []


class ActionFilterLenses(Action):
    """Filters lenses from the pre-loaded DataFrame based on user preferences."""
    def name(self) -> Text:
        return "action_filter_lenses"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        logger.info("Executing action_filter_lenses")
        
        lens_type = tracker.get_slot("lens_type")
        price_range = tracker.get_slot("price_range")
        
        logger.info(f"Filtering with slots - lens_type: '{lens_type}', price_range: '{price_range}'")
        
        if CATALOGUE_DF.empty:
            logger.error("Product catalogue DataFrame is empty. Sending error message to user.")
            dispatcher.utter_message(text="Our product catalogue is currently unavailable. Please check back later.")
            return []
            
        filtered_df = CATALOGUE_DF.copy()
        
        # Filter for products that are lenses
        filtered_df = filtered_df[filtered_df['product_type'].str.contains("Lenses", case=False, na=False)]
        
        if lens_type:
            filtered_df = filtered_df[filtered_df['description'].str.contains(lens_type, case=False, na=False)]
            
        if price_range:
            filtered_df = filter_by_budget(filtered_df, price_range)
            
        top_5 = filtered_df.head(5)
        
        if top_5.empty:
            logger.info("No lenses found matching criteria.")
            dispatcher.utter_message(text="We couldn't find any lenses matching your precise criteria. Try exploring another type or budget limit.")
        else:
            logger.info(f"Found and returning {len(top_5)} products.")
            dispatcher.utter_message(text="Here are some lenses that match your request:")
            for _, row in top_5.iterrows():
                name_val = row.get("product_name", "Unknown Lens")
                price_val = row.get("price_myr", "N/A")
                
                dispatcher.utter_message(text=f"{name_val}\nPrice: RM{price_val}")
                    
        return []
