"""
Calisto Eyewear – RAG Custom Action for Rasa
Full pipeline: query preprocessing → hybrid retrieval (FAISS + BM25)
→ intent-based filtering → re-ranking → response.
"""

import logging
from typing import Any, Dict, List, Text

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

from actions.knowledge_base.config import RELEVANCE_THRESHOLD
from actions.knowledge_base.hybrid_retriever import hybrid_search
from actions.knowledge_base.indexer import KnowledgeSearcher
from actions.knowledge_base.query_preprocessor import preprocess_query

logger = logging.getLogger(__name__)


class ActionDocumentSearch(Action):
    """Semantic + keyword hybrid search over Calisto Eyewear's knowledge base."""

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
            dispatcher.utter_message(
                text="Could you please rephrase your question? I didn't catch that."
            )
            return []

        # Extract intent info from Rasa NLU
        intent_data = tracker.latest_message.get("intent", {})
        intent_name = intent_data.get("name")
        intent_confidence = intent_data.get("confidence", 0.0)

        # Step 1: Preprocess query
        processed_query, entities = preprocess_query(raw_query)
        logger.info(
            "RAG query: raw='%s' → processed='%s' | intent=%s (%.2f) | entities=%s",
            raw_query, processed_query, intent_name, intent_confidence, entities,
        )

        # Step 2: Hybrid search (FAISS + BM25 + intent filter + re-rank)
        searcher = KnowledgeSearcher.get()
        results = hybrid_search(
            searcher=searcher,
            bm25=searcher.bm25,
            query=processed_query,
            entities=entities,
            intent_name=intent_name,
            intent_confidence=intent_confidence,
        )

        # Step 3: Check relevance
        if not results or results[0].get("final_score", 0) < RELEVANCE_THRESHOLD:
            dispatcher.utter_message(
                text="I'm sorry, I couldn't find that information in the Calisto knowledge base. 😔\n\n"
                     "You can try rephrasing, or contact us at +60 1-800-22-5478 for help!"
            )
            return []

        # Step 4: Format best result
        best = results[0]
        answer = best["text"].strip()

        # Cap at ~150 words so responses stay concise
        words = answer.split()
        if len(words) > 150:
            answer = " ".join(words[:150]) + " …"

        logger.info(
            "RAG result: source=%s score=%.3f (faiss=%.3f bm25=%.3f kw=%.3f ent=%.3f)",
            best.get("source", "?"),
            best.get("final_score", 0),
            best.get("_faiss_score", 0),
            best.get("_bm25_score", 0),
            best.get("_keyword_bonus", 0),
            best.get("_entity_bonus", 0),
        )

        dispatcher.utter_message(text=f"📄 {answer}")
        return []
