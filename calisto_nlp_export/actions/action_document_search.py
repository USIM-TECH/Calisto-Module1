"""
Calisto Eyewear – RAG Custom Action for Rasa
Retrieves answers from the FAISS knowledge-base index.
"""

from typing import Any, Dict, List, Text

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

from actions.knowledge_base.indexer import KnowledgeSearcher

# Minimum cosine-similarity score to consider a result relevant
RELEVANCE_THRESHOLD = 0.25


class ActionDocumentSearch(Action):
    """Semantic search over Calisto Eyewear's knowledge base documents."""

    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        query = tracker.latest_message.get("text", "")
        if not query.strip():
            dispatcher.utter_message(
                text="Could you please rephrase your question? I didn't catch that."
            )
            return []

        searcher = KnowledgeSearcher.get()
        results = searcher.search(query, top_k=1)

        if not results or results[0]["score"] < RELEVANCE_THRESHOLD:
            dispatcher.utter_message(
                text="I'm sorry, I couldn't find that information in the Calisto knowledge base. 😔\n\n"
                     "You can try rephrasing, or contact us at +60 1-800-22-5478 for help!"
            )
            return []

        best = results[0]
        answer = best["text"].strip()
        source = best["source"]

        # Cap at ~150 words so responses stay concise
        words = answer.split()
        if len(words) > 150:
            answer = " ".join(words[:150]) + " …"

        dispatcher.utter_message(
            text=f"📄 {answer}"
        )
        return []
