import psycopg2
from psycopg2.extras import DictCursor
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

# Database Configuration
import os
import psycopg2
from psycopg2.extras import DictCursor

DB_HOST = os.getenv("KB_DB_HOST", "localhost")
DB_USER = os.getenv("KB_DB_USER", "calisto")
DB_PASS = os.getenv("KB_DB_PASSWORD", "calisto")
DB_NAME = os.getenv("KB_DB_NAME", "calisto_kb")
DB_PORT = os.getenv("KB_DB_PORT", "5432")
CATALOGUE_PATH = os.getenv("KB_CATALOGUE_PATH", "knowledge_base/calisto_product_catalog_500.csv")

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        port=DB_PORT
    )

def init_postgres_db():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS kb_products (
                product_id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                product_name TEXT NOT NULL,
                price_myr DOUBLE PRECISION NOT NULL,
                store_location TEXT NOT NULL
            )
        ''')
        cur.execute('SELECT COUNT(*) FROM kb_products')
        count = cur.fetchone()[0]
        if count == 0:
            logger.info("Database empty, populating from CSV...")
            if os.path.exists(CATALOGUE_PATH):
                import pandas as pd
                df = pd.read_csv(CATALOGUE_PATH)
                for _, row in df.iterrows():
                    cur.execute('''
                        INSERT INTO kb_products (product_id, category, product_name, price_myr, store_location)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (product_id) DO NOTHING
                    ''', (row['Product_ID'], row['Category'], row['Product_Name'], row['Price_MYR'], row['Store_Location']))
            else:
                logger.error("Could not find calisto_product_catalog_500.csv to seed DB!")
        conn.commit()
        cur.close()
        conn.close()
        logger.info("PostgreSQL database initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize PostgreSQL DB: {e}")

# Run DB Init
init_postgres_db()

def get_budget_sql(price_range: str) -> tuple[str, list]:
    if not price_range:
        return "", []
    budget_lower = price_range.lower().replace(" ", "").replace("–", "-")
    if "underrm100" in budget_lower:
        return " AND price_myr < 100", []
    elif "rm100-rm250" in budget_lower:
        return " AND price_myr >= 100 AND price_myr <= 250", []
    elif "rm250-rm300" in budget_lower:
        return " AND price_myr >= 250 AND price_myr <= 300", []
    elif "aboverm300" in budget_lower:
        return " AND price_myr > 300", []
    return "", []




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
    """Filters products directly from PostgreSQL based on user preferences."""
    def name(self) -> Text:
        return "action_filter_products"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        product_type = tracker.get_slot("product_type")
        brand = tracker.get_slot("brand")
        price_range = tracker.get_slot("price_range")
        
        logger.info(f"DB Filtering - product_type: '{product_type}', brand: '{brand}', price_range: '{price_range}'")
        
        try:
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=DictCursor)
            
            query = "SELECT * FROM kb_products WHERE 1=1"
            params = []
            
            if product_type:
                query += " AND product_type ILIKE %s"
                params.append(f"%{product_type}%")
                
            if brand and brand.lower() != "show all brands":
                query += " AND brand ILIKE %s"
                params.append(f"%{brand}%")
                
            if price_range:
                budget_sql, _ = get_budget_sql(price_range)
                query += budget_sql
                
            query += " LIMIT 5"
            cur.execute(query, tuple(params))
            results = cur.fetchall()
            
            if not results:
                logger.info("No products found matching criteria in DB.")
                dispatcher.utter_message(text="We couldn't find any eyewear matching your precise criteria. Try exploring another brand or budget limit.")
            else:
                logger.info(f"Found and returning {len(results)} products from DB.")
                dispatcher.utter_message(text="Here are some products that match your request (DB):")
                for row in results:
                    name_val = row["product_name"]
                    price_val = row["price_myr"]
                    dispatcher.utter_message(text=f"• **{name_val}** - RM {price_val}")
                    
            cur.close()
            conn.close()
        except Exception as e:
            logger.error(f"DB query failed: {e}")
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


class ActionAskCity(Action):
    """Dynamically asks for the city to find a store."""
    def name(self) -> Text:
        return "action_ask_city"
        
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT DISTINCT city FROM kb_stores ORDER BY city ASC;")
            cities = cur.fetchall()
            cur.close()
            conn.close()
            
            buttons = []
            for (city_name,) in cities:
                if not city_name: continue
                title = city_name.title()
                buttons.append({"title": title, "payload": f'/choose_city{{"city":"{city_name}"}}'})
                
            dispatcher.utter_message(text="Which city are you looking for?", buttons=buttons)
        except Exception as e:
            logger.error(f"Failed to fetch cities from DB: {e}")
            dispatcher.utter_message(text="Which city are you looking for?")
            
        return []

class ActionAskCity(Action):
    """Dynamically asks for the city to find a store."""
    def name(self) -> Text:
        return "action_ask_city"
        
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT DISTINCT city FROM kb_stores ORDER BY city ASC;")
            cities = cur.fetchall()
            cur.close()
            conn.close()
            
            buttons = []
            for (city_name,) in cities:
                if not city_name: continue
                title = city_name.title()
                buttons.append({"title": title, "payload": f'/choose_city{{"city":"{city_name}"}}'})
                
            dispatcher.utter_message(text="Which city are you looking for?", buttons=buttons)
        except Exception as e:
            logger.error(f"Failed to fetch cities from DB: {e}")
            dispatcher.utter_message(text="Which city are you looking for?")
            
        return []

class ActionAskCity(Action):
    """Dynamically asks for the city to find a store."""
    def name(self) -> Text:
        return "action_ask_city"
        
    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT DISTINCT city FROM kb_stores ORDER BY city ASC;")
            cities = cur.fetchall()
            cur.close()
            conn.close()
            
            buttons = []
            for (city_name,) in cities:
                if not city_name: continue
                title = city_name.title()
                buttons.append({"title": title, "payload": f'/choose_city{{"city":"{city_name}"}}'})
                
            dispatcher.utter_message(text="Which city are you looking for?", buttons=buttons)
        except Exception as e:
            logger.error(f"Failed to fetch cities from DB: {e}")
            dispatcher.utter_message(text="Which city are you looking for?")
            
        return []

class ActionFindStore(Action):
    """Finds store details based on a given city using Postgres."""
    def name(self) -> Text:
        return "action_find_store"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        city = tracker.get_slot("city")
        logger.info(f"Executing action_find_store for city: {city}")
        
        if not city:
            dispatcher.utter_message(text="Please specify the city to find a store.")
            return []
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT name, phone, hours, address FROM kb_stores WHERE city ILIKE %s;", (f"%{city}%",))
            stores = cur.fetchall()
            cur.close()
            conn.close()
            
            if stores:
                dispatcher.utter_message(text=f"Here are the stores we found in **{city.title()}**:")
                for store in stores:
                    name, phone, hours, address = store
                    msg = f"🛒 **{name}**\n📍 {address}\n⏰ {hours}\n📞 {phone}"
                    dispatcher.utter_message(text=msg)
            else:
                dispatcher.utter_message(text=f"Sorry, we couldn't find any stores in {city.title()}.")
                
        except Exception as e:
            logger.error(f"Failed to fetch stores for {city}: {e}")
            dispatcher.utter_message(text="We are currently unable to retrieve the store list. Please try again later.")
            
        return []
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT name, phone, hours, address FROM kb_stores WHERE city ILIKE %s;", (f"%{city}%",))
            stores = cur.fetchall()
            cur.close()
            conn.close()
            
            if stores:
                dispatcher.utter_message(text=f"Here are the stores we found in **{city.title()}**:")
                for store in stores:
                    name, phone, hours, address = store
                    msg = f"🛒 **{name}**\n📍 {address}\n⏰ {hours}\n📞 {phone}"
                    dispatcher.utter_message(text=msg)
            else:
                dispatcher.utter_message(text=f"Sorry, we couldn't find any stores in {city.title()}.")
                
        except Exception as e:
            logger.error(f"Failed to fetch stores for {city}: {e}")
            dispatcher.utter_message(text="We are currently unable to retrieve the store list. Please try again later.")
            
        return []
            
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT name, phone, hours, address FROM kb_stores WHERE city ILIKE %s;", (f"%{city}%",))
            stores = cur.fetchall()
            cur.close()
            conn.close()
            
            if stores:
                dispatcher.utter_message(text=f"Here are the stores we found in **{city.title()}**:")
                for store in stores:
                    name, phone, hours, address = store
                    msg = f"🛒 **{name}**\n📍 {address}\n⏰ {hours}\n📞 {phone}"
                    dispatcher.utter_message(text=msg)
            else:
                dispatcher.utter_message(text=f"Sorry, we couldn't find any stores in {city.title()}.")
                
        except Exception as e:
            logger.error(f"Failed to fetch stores for {city}: {e}")
            dispatcher.utter_message(text="We are currently unable to retrieve the store list. Please try again later.")
            
        return []



class ActionSearchProductByAttribute(Action):
    """Filters products by attributes or free text user query directly from PostgreSQL."""
    def name(self) -> Text:
        return "action_search_product_by_attribute"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        logger.info("Executing action_search_product_by_attribute via DB")

        frame_color = tracker.get_slot("frame_color")
        frame_shape = tracker.get_slot("frame_shape")
        frame_material = tracker.get_slot("frame_material")
        user_message = (tracker.latest_message.get('text') or "").lower()

        try:
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=DictCursor)
            
            query = "SELECT * FROM kb_products WHERE 1=1"
            params = []
            
            # Assuming these attributes might be buried in product_name since the table schema only explicitly shows category and product_name
            # Fallback text fuzzy search if none of the explicit slots are used
            fallback_used = False
            
            if frame_color:
                query += " AND product_name ILIKE %s"
                params.append(f"%{frame_color}%")
                
            if frame_shape:
                query += " AND product_name ILIKE %s"
                params.append(f"%{frame_shape}%")
                
            if frame_material:
                query += " AND product_name ILIKE %s"
                params.append(f"%{frame_material}%")
                
            if not frame_color and not frame_shape and not frame_material and len(user_message) > 3:
                fallback_used = True
                query_parts = user_message.split()
                for part in query_parts:
                    if len(part) > 3 and part not in ["glasses", "sunglasses", "frames", "need", "want", "looking"]:
                        query += " AND product_name ILIKE %s"
                        params.append(f"%{part}%")
                        
            query += " LIMIT 5"
            cur.execute(query, tuple(params))
            results = cur.fetchall()
            cur.close()
            conn.close()

            if not results:
                logger.info("No query matches found in the DB.")
                dispatcher.utter_message(text="I couldn't find any products perfectly matching your description.")
            else:
                dispatcher.utter_message(text="Here are some options based on what you asked for:")
                for index, row in enumerate(results):
                    name_val = row["product_name"]
                    price_val = row["price_myr"]
                    msg = f"• **{name_val}** - RM {price_val}"
                    dispatcher.utter_message(text=msg)

        except Exception as e:
            logger.error(f"DB attribute query failed: {e}")
            dispatcher.utter_message(text="Our product catalogue is currently unavailable. Please try again later.")

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
    """Filters lenses from the CSV data directly."""
    def name(self) -> Text:
        return "action_filter_lenses"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        import pandas as pd
        import re
        
        lens_type = tracker.get_slot("lens_type")
        price_range = tracker.get_slot("price_range")
        
        logger.info(f"Pandas Lens Filter - config: '{lens_type}', '{price_range}'")
        
        try:
            df = pd.read_csv(CATALOGUE_PATH)
            
            mask = df['category'].str.contains('Lens', case=False, na=False) | df['product_type'].str.contains('Lens', case=False, na=False) | df['category'].str.contains('Contact', case=False, na=False)
            
            if lens_type:
                lt = lens_type.lower().replace(" lenses", "").replace(" protection", "").strip()
                lens_mask = (
                    df['lens_type'].str.contains(lt, case=False, na=False) |
                    df['lens_feature'].str.contains(lt, case=False, na=False) |
                    df['product_name'].str.contains(lt, case=False, na=False) |
                    df['description'].str.contains(lt, case=False, na=False)
                )
                mask = mask & lens_mask
                
            if price_range:
                pr = price_range.lower()
                if "under rm" in pr:
                    lim = float(re.sub(r'[^0-9.]', '', pr))
                    mask = mask & (df['price_myr'] <= lim)
                elif "over rm" in pr or "above rm" in pr:
                    lim = float(re.sub(r'[^0-9.]', '', pr))
                    mask = mask & (df['price_myr'] >= lim)
                elif "-" in pr:
                    parts = pr.split("-")
                    if len(parts) == 2:
                        l = float(re.sub(r'[^0-9.]', '', parts[0]))
                        h = float(re.sub(r'[^0-9.]', '', parts[1]))
                        mask = mask & (df['price_myr'] >= l) & (df['price_myr'] <= h)

            results = df[mask].head(5)
            
            if results.empty:
                dispatcher.utter_message(text=f"We couldn't find any lenses matching your criteria. Try adjusting the search.")
            else:
                dispatcher.utter_message(text="Here are some matching lenses:")
                for _, row in results.iterrows():
                    dispatcher.utter_message(text=f"• {row['product_name']} - RM {row['price_myr']}")
                    
        except Exception as e:
            logger.error(f"Lens query failed: {e}")
            dispatcher.utter_message(text="Our product catalogue is temporarily unavailable.")
            
        return []


class ActionAskBrand(Action):
    """Provides product brands based on the product type from DB."""
    def name(self) -> Text:
        return "action_ask_brand"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        product_type = tracker.get_slot("product_type")
        
        # Connect to DB and get distinct brands for this product type
        brands = []
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            
            if product_type:
                # Need to use split words for flexibility or use simple ILIKE
                query = "SELECT DISTINCT brand FROM kb_products WHERE product_type ILIKE %s AND brand IS NOT NULL AND trim(brand) != ''"
                cur.execute(query, (f"%{product_type}%",))
            else:
                query = "SELECT DISTINCT brand FROM kb_products WHERE brand IS NOT NULL AND trim(brand) != ''"
                cur.execute(query)
                
            rows = cur.fetchall()
            brands = [r[0] for r in rows if r[0]]
            cur.close()
            conn.close()
        except Exception as e:
            logging.error(f"Error fetching brands from DB: {e}")

        # Ensure we only pick 4 to avoid too many buttons
        brands = list(set(brands))[:4]

        buttons = []
        for b in brands:
            buttons.append({"title": b.title(), "payload": f'/select_brand{{"brand":"{b}"}}'})
        buttons.append({"title": "Show All Brands", "payload": '/select_brand{"brand":"Show All Brands"}'})
        
        if product_type and "contact" in product_type.lower():
            text = "Which brand of contact lenses would you like to explore?"
        elif product_type and "sunglasses" in product_type.lower():
            text = "What brand of sunglasses are you interested in?"
        else:
            text = "Which brand would you like to explore?"
            
        dispatcher.utter_message(text=text, buttons=buttons)
        return []
