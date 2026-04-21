from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

ALLOWED_EMOTIONS = {"neutral", "confused", "frustrated", "hesitant", "interested"}
FAQ_HINTS = {
    "return policy": "ask_return_policy",
    "refund": "ask_refund_policy",
    "exchange": "ask_refund_policy",
    "warranty": "ask_warranty_policy",
    "company": "ask_company_info",
    "about calisto": "ask_company_info",
}


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _is_expected_slot_value(expected_slot: Optional[str], user_input: str) -> bool:
    value = _normalize_text(user_input)
    if not expected_slot:
        return False
    if expected_slot in {"contact_number", "phone_number", "phone"}:
        digits = re.sub(r"\D", "", value)
        return 8 <= len(digits) <= 15
    if expected_slot == "email":
        return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value))
    if expected_slot == "lead_name":
        return bool(re.fullmatch(r"[A-Za-z][A-Za-z .'\-]{1,59}", value))
    if expected_slot in {"lead_location", "location"}:
        return bool(re.fullmatch(r"[A-Za-z0-9 .,'/\-]{2,80}", value))
    if expected_slot == "purchase_timeline":
        lowered = value.lower()
        return any(token in lowered for token in ["this week", "2 week", "two week", "exploring"])
    if expected_slot == "preferred_service":
        return len(value) >= 3
    return False


def _heuristic_emotion(user_input: str) -> str:
    normalized = _normalize_text(user_input).lower()
    if not normalized:
        return "neutral"
    if any(token in normalized for token in ["frustrating", "annoying", "useless", "angry", "already told you"]):
        return "frustrated"
    if any(token in normalized for token in ["don't want", "do not want", "prefer not", "not comfortable", "maybe later", "not ready"]):
        return "hesitant"
    if any(token in normalized for token in ["don't understand", "do not understand", "confused", "what do you mean", "can you explain"]):
        return "confused"
    if any(token in normalized for token in ["i want", "show me", "looking for", "recommend", "what is your", "price", "book"]):
        return "interested"
    if "?" in normalized:
        return "confused"
    return "neutral"


def _heuristic_intent(user_input: str, candidate_intent: Optional[str]) -> str:
    normalized = _normalize_text(user_input).lower()
    for token, intent in FAQ_HINTS.items():
        if token in normalized:
            return intent
    if any(token in normalized for token in ["glasses", "frames", "sunglasses", "lenses", "gucci", "rayban"]):
        return "ask_product"
    if candidate_intent:
        return candidate_intent
    return "general_query"


def _heuristic_use_rag(intent: str, user_input: str) -> bool:
    normalized = _normalize_text(user_input).lower()
    return intent.startswith("ask_") and (
        intent in {"ask_return_policy", "ask_refund_policy", "ask_warranty_policy", "ask_company_info"}
        or any(token in normalized for token in FAQ_HINTS)
    )


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _normalize_decision(
    payload: Optional[Dict[str, Any]],
    *,
    current_flow: Optional[str],
    expected_slot: Optional[str],
    user_input: str,
    candidate_intent: Optional[str],
) -> Dict[str, Any]:
    heuristic_intent = _heuristic_intent(user_input, candidate_intent)
    slot_valid = _is_expected_slot_value(expected_slot, user_input)
    emotion = _heuristic_emotion(user_input)
    payload_response = _normalize_text(payload.get("response")) if payload else ""
    response = payload_response or None

    if slot_valid:
        return {
            "intent": candidate_intent or heuristic_intent,
            "is_slot_valid": True,
            "is_interruption": False,
            "emotion": emotion,
            "use_rag": False,
            "response": response,
        }

    if not payload:
        return {
            "intent": heuristic_intent,
            "is_slot_valid": False,
            "is_interruption": bool(current_flow and heuristic_intent not in {"general_query", candidate_intent}),
            "emotion": emotion,
            "use_rag": _heuristic_use_rag(heuristic_intent, user_input),
            "response": response,
        }

    intent = _normalize_text(payload.get("intent")) or heuristic_intent
    parsed_emotion = _normalize_text(payload.get("emotion")).lower()
    if parsed_emotion not in ALLOWED_EMOTIONS:
        parsed_emotion = emotion

    use_rag = bool(payload.get("use_rag")) or _heuristic_use_rag(intent, user_input)
    is_interruption = bool(payload.get("is_interruption"))
    if current_flow and intent != (candidate_intent or current_flow):
        is_interruption = is_interruption or intent not in {"general_query"}

    return {
        "intent": intent,
        "is_slot_valid": bool(payload.get("is_slot_valid")),
        "is_interruption": is_interruption,
        "emotion": parsed_emotion,
        "use_rag": use_rag,
        "response": response,
    }


@dataclass
class ReasoningRequest:
    current_flow: Optional[str]
    expected_slot: Optional[str]
    user_input: str
    candidate_intent: Optional[str] = None
    candidate_confidence: Optional[float] = None
    rasa_intent: Optional[str] = None


import ollama

class OllamaReasoner:
    def __init__(self) -> None:
        self.model_name = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.client = ollama.Client(host=self.ollama_host)
        self.ready = False
        self.load_error: Optional[str] = None
        self.backend = "ollama"

    def load(self) -> None:
        try:
            logger.info("Checking connection to Ollama at %s", self.ollama_host)
            self.client.list()
            logger.info("Ollama connection successful")
            self.ready = True
            self.backend = "ollama"
        except Exception as exc:
            self.ready = False
            self.load_error = str(exc)
            self.backend = "heuristic"
            logger.exception("Failed to connect to Ollama: %s", exc)

    def _build_reasoning_prompt(self, request: ReasoningRequest) -> list[dict[str, str]]:
        system_prompt = """You are a smart reasoning engine for an eyewear chatbot (Calisto Eyewear).
        
Tasks:
1. Detect user intent from the list: ask_product, find_a_store, store_hours, book_appointment, ask_pricing, ask_faq, general_query.
2. Detect if the user's message is an interruption to the current flow.
3. Detect user emotion: neutral, frustrated, confused, hesitant, interested.

Return ONLY JSON:
{
    "intent": "<intent>",
    "is_interruption": true/false,
    "emotion": "<emotion>",
    "is_slot_valid": true/false
}
"""
        user_prompt = f'User message: "{request.user_input}"\nCurrent Flow: {request.current_flow}\nExpected Slot: {request.expected_slot}'
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _build_rewrite_prompt(self, user_input: str, rasa_response: str, emotion: str, intent: str) -> list[dict[str, str]]:
        system_prompt = f"""You are a tone-shaping assistant for Calisto Eyewear.
        
Task: Rewrite the provided Rasa response to match the user's emotion and the conversation context.

Detected Emotion: {emotion}
Detected Intent: {intent}

Guidelines:
1. DO NOT change the core information, facts, or instructions from the Rasa response.
2. Empathize with the user's emotion ({emotion}).
3. Keep the response natural, professional, and helpful.
4. If the Rasa response has buttons or specific options, keep them as-is.
5. Do not hallucinate brand information or policies not in the original text.

Return ONLY the rewritten text.
"""
        user_prompt = f'Original Rasa Response: "{rasa_response}"\nUser Message: "{user_input}"'
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _generate(self, messages: list[dict[str, str]]) -> Optional[str]:
        if not self.ready:
            return None
        try:
            response = self.client.chat(
                model=self.model_name,
                messages=messages,
                options={"temperature": 0.0},
            )
            return response["message"]["content"]
        except Exception:
            logger.exception("Error during Ollama generation")
            return None

    def reason(self, request: ReasoningRequest) -> Dict[str, Any]:
        messages = self._build_reasoning_prompt(request)
        raw_output = self._generate(messages)
        payload = _extract_json_block(raw_output or "")
        return _normalize_decision(
            payload,
            current_flow=request.current_flow,
            expected_slot=request.expected_slot,
            user_input=request.user_input,
            candidate_intent=request.candidate_intent,
        )

    def rewrite(self, user_input: str, rasa_response: str, emotion: str, intent: str) -> str:
        if not self.ready:
            return rasa_response
        
        messages = self._build_rewrite_prompt(user_input, rasa_response, emotion, intent)
        rewritten = self._generate(messages)
        
        if not rewritten:
            return rasa_response
            
        return rewritten.strip()