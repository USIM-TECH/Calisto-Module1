from __future__ import annotations

import logging
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

from reasoning_service.ollama_reasoner import OllamaReasoner, ReasoningRequest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="calisto-reasoning-service", version="1.0.0")
reasoner = OllamaReasoner()


class ReasonRequestModel(BaseModel):
    current_flow: Optional[str] = None
    expected_slot: Optional[str] = None
    user_input: str = Field(min_length=1, max_length=2000)
    candidate_intent: Optional[str] = None
    candidate_confidence: Optional[float] = None
    rasa_intent: Optional[str] = None


class RewriteRequestModel(BaseModel):
    user_input: str = Field(min_length=1, max_length=2000)
    rasa_response: str = Field(min_length=1, max_length=5000)
    emotion: str = Field(min_length=1, max_length=50)
    intent: str = Field(min_length=1, max_length=100)


class ReasonResponseModel(BaseModel):
    intent: str
    is_slot_valid: bool
    is_interruption: bool
    emotion: str
    use_rag: bool
    response: Optional[str] = None


@app.on_event("startup")
def startup() -> None:
    logger.info("Starting Ollama reasoning service")
    reasoner.load()


@app.get("/health")
def health() -> dict:
    status = "ok" if reasoner.ready else ("degraded" if reasoner.backend == "heuristic" else "loading")
    return {
        "status": status,
        "backend": reasoner.backend,
        "model": reasoner.model_name,
        "error": reasoner.load_error,
    }


@app.post("/reason", response_model=ReasonResponseModel)
def reason(payload: ReasonRequestModel) -> ReasonResponseModel:
    result = reasoner.reason(
        ReasoningRequest(
            current_flow=payload.current_flow,
            expected_slot=payload.expected_slot,
            user_input=payload.user_input,
            candidate_intent=payload.candidate_intent,
            candidate_confidence=payload.candidate_confidence,
            rasa_intent=payload.rasa_intent,
        )
    )
    return ReasonResponseModel(**result)


@app.post("/rewrite")
def rewrite(payload: RewriteRequestModel) -> dict:
    enhanced = reasoner.rewrite(
        user_input=payload.user_input,
        rasa_response=payload.rasa_response,
        emotion=payload.emotion,
        intent=payload.intent,
    )
    return {"enhanced_response": enhanced}
