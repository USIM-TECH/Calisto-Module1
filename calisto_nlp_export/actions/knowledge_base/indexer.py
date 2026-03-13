"""Calisto Eyewear – pgvector index builder and runtime searcher."""

from typing import List, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer

from actions.knowledge_base.postgres_store import KnowledgeBaseStorage

# ── Defaults ────────────────────────────────────────────────
MODEL_NAME = "all-MiniLM-L6-v2"


def build_index(chunks: List[Tuple[str, str]]) -> None:
    """Embed *chunks* and persist them into PostgreSQL with pgvector."""
    model = SentenceTransformer(MODEL_NAME)

    texts = [text for _, text in chunks]

    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True, batch_size=32)
    embeddings = np.array(embeddings, dtype="float32").tolist()

    inserted = KnowledgeBaseStorage.get().replace_document_embeddings(chunks, embeddings)
    print(f"[✓] Vector index built in PostgreSQL: {inserted} chunks")


class KnowledgeSearcher:
    """Lazy-loaded searcher that queries pgvector at runtime."""

    _instance = None  # singleton

    def __init__(self) -> None:
        self.model = SentenceTransformer(MODEL_NAME)
        self.storage = KnowledgeBaseStorage.get()

    @classmethod
    def get(cls) -> "KnowledgeSearcher":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def search(self, query: str, top_k: int = 3) -> List[dict]:
        """Return top-k results as dicts with keys: source, text, score."""
        vec = self.model.encode([query], normalize_embeddings=True)
        query_embedding = np.array(vec, dtype="float32")[0].tolist()

        rows = self.storage.search_document_embeddings(query_embedding, top_k=top_k)
        return [
            {"source": row["source"], "text": row["text"], "score": float(row["score"])}
            for row in rows
        ]
