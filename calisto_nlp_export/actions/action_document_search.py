import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Text

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

logger = logging.getLogger(__name__)


def _dedupe_sentences(text: str) -> str:
    seen = set()
    ordered: List[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        cleaned = " ".join(sentence.split()).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(cleaned)
    return " ".join(ordered)


def _clean_retrieved_answer(text: str) -> str:
    answer = " ".join(text.split()).strip()

    # Prefer the answer portion if the chunk contains FAQ-style Q/A text.
    if " A:" in answer:
        answer = answer.split(" A:", 1)[1].strip()
    if " Q:" in answer:
        answer = answer.split(" Q:", 1)[0].strip()

    # Remove a leading fragment when the chunk starts mid-sentence.
    if answer.lower().startswith("location to process"):
        answer = (
            "Bring the item back to any Calisto store location to process a prompt "
            "refund or exchange. " + answer
        )

    answer = _dedupe_sentences(answer)
    return answer


class ActionDocumentSearch(Action):
    """Search the knowledge-base via the backend service."""

    def name(self) -> Text:
        return "action_document_search"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        raw_query = (tracker.latest_message.get("text") or "").strip()
        if not raw_query:
            dispatcher.utter_message(
                text="Could you please rephrase your question? I didn't catch that."
            )
            return []

        intent = tracker.latest_message.get("intent") or {}
        entities = tracker.latest_message.get("entities") or []
        
        payload = {
            "query": raw_query,
            "intent": intent.get("name"),
            "entities": entities,
        }

        # Use the ServiceGateway from actions.py
        from actions.actions import gateway

        results = gateway._request("POST", "/knowledge/search", payload)

        if not results:
            dispatcher.utter_message(
                text=(
                    "I'm sorry, I couldn't find that information in the Calisto knowledge base.\n\n"
                    "You can try rephrasing, or contact us at +60 1-800-22-5478 for help!"
                )
            )
            return []

        # Assuming the backend returns a list of results like the old hybrid_search
        best_result = results[0]
        answer = _clean_retrieved_answer((best_result.get("text") or "").strip())

        words = answer.split()
        if len(words) > 150:
            answer = " ".join(words[:150]) + " ..."

        logger.info(
            "Matched knowledge-base source '%s' with score %.3f",
            best_result.get("source", "unknown"),
            float(best_result.get("score", 0.0)),
        )
        dispatcher.utter_message(text=f"📄 {answer}")
        return []
