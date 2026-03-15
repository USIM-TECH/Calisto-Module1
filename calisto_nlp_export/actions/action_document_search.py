import logging
import os
import psycopg2
from typing import Any, Dict, List, Text
from sentence_transformers import SentenceTransformer

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

logger = logging.getLogger(__name__)

# Preload embedding model
EMBEDDING_MODEL = SentenceTransformer("all-MiniLM-L6-v2")

DB_HOST = os.getenv("KB_DB_HOST", "localhost")
DB_USER = os.getenv("KB_DB_USER", "calisto")
DB_PASS = os.getenv("KB_DB_PASSWORD", "calisto")
DB_NAME = os.getenv("KB_DB_NAME", "calisto_kb")
DB_PORT = os.getenv("KB_DB_PORT", "5432")

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        port=DB_PORT
    )

class ActionDocumentSearch(Action):
    """Semantic search over Calisto Eyewear's knowledge base via PostgreSQL pgvector."""
    
    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        raw_query = tracker.latest_message.get("text", "")
        if not raw_query.strip():
            dispatcher.utter_message(text="Could you please rephrase your question? I didn't catch that.")
            return []

        logger.info(f"DB Vector RAG query: '{raw_query}'")

        try:
            vec = EMBEDDING_MODEL.encode(raw_query).tolist()
            # Construct standard pgvector string format
            vec_str = '[' + ','.join(map(str, vec)) + ']'
            
            conn = get_db_connection()
            cur = conn.cursor()
            
            cur.execute('''
                SELECT text, source, (embedding <=> %s::vector) AS distance 
                FROM kb_document_embeddings 
                ORDER BY distance ASC 
                LIMIT 1;
            ''', (vec_str,))
            
            result = cur.fetchone()
            cur.close()
            conn.close()
            
            if not result or result[2] > 0.65:
                dispatcher.utter_message(
                    text="I'm sorry, I couldn't find that information in the Calisto knowledge base. \n\n"
                         "You can try rephrasing, or contact us at +60 1-800-22-5478 for help!"
                )
                return []

            answer = result[0].strip()
            if ':' in answer and len(answer.split(':', 1)[0].split('.')) == 2:
                answer = answer.split(':', 1)[1].strip()

            words = answer.split()
            if len(words) > 150:
                answer = " ".join(words[:150]) + " …"
                
            # Log successful query
            logger.info(f"Matched FAQ source '{result[1]}' with distance {result[2]:.3f}")
            dispatcher.utter_message(text=f"📄 {answer}")
            
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            dispatcher.utter_message(text="Our knowledge base is currently experiencing issues. Please try again later.")

        return []
